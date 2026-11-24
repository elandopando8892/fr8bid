import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// PostgREST returns SQLSTATE to the Edge handler. Use psql locally to retain
// that contract for failures as well as successes, without a network listener.
export async function postgresReapertura(container: string, rateware: string) {
  if (!/^[a-f0-9]{64}$/.test(container)) throw Error('Expected a disposable container ID');
  const socket = await exec('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  const target = await exec('docker', ['inspect', container, '--format', '{{.Name}} {{.HostConfig.NetworkMode}} {{index .HostConfig.Tmpfs "/var/lib/postgresql/data"}}']);
  if (!/^(npipe|unix):\/\//.test(socket.stdout) || !/^\/rfx-draft-test-[a-f0-9-]+ none rw\s*$/.test(target.stdout)) {
    throw Error('Expected the local, network-isolated Rateware test database in tmpfs');
  }
  const command = (vars: string[] = []) => exec('docker', ['exec', '-i', container, 'psql',
    '-XqAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', ...vars], { timeout: 45000 });
  async function sql(statement: string, args: Record<string, unknown> = {}) {
    const result = command(['-v', 'args=' + JSON.stringify(args)]);
    result.child.stdin!.end(statement + '\n');
    return (await result).stdout.trim();
  }

  const eventId = '33333333-3333-4333-8333-333333333333';
  await sql(`insert into public.rfx_events (id, organization_id, owner_email, rfx_id, name, status, due_date)
    values ('${eventId}', 'synthetic-mcp', 'org:synthetic-mcp', 'RFx-LOCAL-CONTENTION', 'Local contention', 'closed', '2000-01-01');`);

  // This connection owns the row until the caller has observed the contenders waiting.
  async function withRowLock<T>(work: () => Promise<T>) {
    const holder = command();
    const lines = createInterface({ input: holder.child.stdout! });
    try {
      const ready = once(lines, 'line');
      holder.child.stdin!.write(`begin; select id from public.rfx_events where id='${eventId}' for update;\n`);
      const [lockedId] = await Promise.race([ready, holder.then(() => { throw Error('Lock holder exited early'); })]);
      if (lockedId !== eventId) throw Error('Fixture row was not locked');
      return await work();
    } finally {
      lines.close();
      holder.child.stdin!.end('rollback;\n');
      await holder;
    }
  }

  const { handleRfxEventReopen } = await import(/* @vite-ignore */ resolve(rateware, 'supabase/functions/rateware-api/rfx-event-reopen.ts'));
  const actor = { user_id: '00000000-0000-4000-8000-000000000001', email: 'sales@heymarksman.com',
    owner_user_id: 'synthetic-mcp', owner_email: 'org:synthetic-mcp', organization_id: 'synthetic-mcp', role: 'admin' };
  const failures = new Map<string, string>();
  async function rpc(name: string, args: Record<string, unknown>) {
    if (name !== 'reopen_rfx_event_once' || args.p_event_id !== eventId) throw Error('Unexpected test RPC target');
    try {
      const receipt = await sql(`set application_name = 'fr8bid-reopen-contender'; set role service_role;
        select public.reopen_rfx_event_once((a->>'p_event_id')::uuid, (a->>'p_new_due_date')::date,
          a->'p_actor', (a->>'p_operation_id')::uuid, a->>'p_expected_version', a->>'p_reason', a->>'p_approval_text')
        from (select :'args'::jsonb as a) params;`, args);
      return { data: JSON.parse(receipt), error: null };
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? '';
      const code = /ERROR:\s+([0-9A-Z]{5}):/.exec(stderr)?.[1];
      if (!code) throw error;
      failures.set(String(args.p_operation_id), code);
      return { data: null, error: { code, message: stderr } };
    }
  }
  const send = async (body: Record<string, unknown>) => ({
    ...await handleRfxEventReopen(body, actor, rpc, 'synthetic-reopen-signing-key-for-tests-only'), headers: {},
  });
  const waiters = async () => Number(await sql(`select count(*) from pg_stat_activity
    where application_name='fr8bid-reopen-contender' and cardinality(pg_blocking_pids(pid)) > 0;`));
  const state = async () => JSON.parse(await sql(`select json_build_object('status', status, 'due', due_date, 'receipts',
    (select coalesce(json_agg(id), '[]'::json) from public.saas_audit_log where entity_id=e.id::text and action='rfx.event.reopen'))
    from public.rfx_events e where id='${eventId}';`));
  return { eventId, send, failures, withRowLock, waiters, state };
}
