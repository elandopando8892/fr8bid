import { describe, expect, it, onTestFinished } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

describe('revisión CLI', () => {
  it('un diff truncado falla aunque el revisor responda APROBADO', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fr8bid-review-'));
    const run = (command: string, args: string[]) => {
      const result = spawnSync(command, args, { cwd: dir, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    };
    try {
      mkdirSync(join(dir, 'scripts/agentes'), { recursive: true });
      for (const file of ['codex.mjs', 'nucleo.mjs']) cpSync(resolve('scripts/agentes', file), join(dir, 'scripts/agentes', file));
      writeFileSync(join(dir, '.gitignore'), '.agentes\n');
      writeFileSync(join(dir, 'fake.mjs'), `import {writeFileSync} from 'node:fs';
if (process.argv.includes('--version')) console.log('synthetic reviewer');
else { for await (const chunk of process.stdin) { /* consume el prompt como el CLI real */ } writeFileSync(process.argv[process.argv.indexOf('--output-last-message') + 1], 'VEREDICTO: APROBADO'); }
`);
      const fake = join(dir, process.platform === 'win32' ? 'fake.cmd' : 'fake');
      writeFileSync(fake, process.platform === 'win32' ? '@echo off\r\nnode "%~dp0fake.mjs" %*\r\n' : '#!/bin/sh\nexec node "$(dirname "$0")/fake.mjs" "$@"\n', { mode: 0o755 });
      run('git', ['init', '--quiet']);
      run('git', ['add', '.']);
      run('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture']);
      writeFileSync(join(dir, 'large.txt'), 'x'.repeat(200_001));
      const result = spawnSync(process.execPath, ['scripts/agentes/codex.mjs', 'revisar', '--base', 'HEAD'], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, CODEX_BIN: fake }, timeout: 20_000
      });
      expect(result.status, result.stderr + result.stdout).toBe(2);
      const registry = join(dir, '.agentes/registro');
      const file = readdirSync(registry).find(name => name.endsWith('.revision.json'))!;
      expect(JSON.parse(readFileSync(join(registry, file), 'utf8'))).toMatchObject({ completo: false, veredicto: 'APROBADO' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

it('el arnés prueba solo después de revisar ese commit e invalida la verificación al revisar de nuevo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fr8bid-gate-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const git = (args: string[], cwd = dir) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  const work = join(dir, '.agentes/trabajos/fixture');
  const record = join(dir, '.agentes/registro');
  const marker = join(work, '.agentes/pruebas.txt');
  const bin = join(dir, 'node_modules/.bin');
  const win = process.platform === 'win32';
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'path'));
  const run = (args: string[], expected: number, cwd = dir) => {
    const result = spawnSync(process.execPath, [join(dir, 'scripts/agentes/codex.mjs'), ...args], {
      cwd, encoding: 'utf8', timeout: 20_000,
      env: {
        ...env, PATH: bin + delimiter + process.env.PATH,
        CODEX_BIN: join(dir, win ? 'fake.cmd' : 'fake'), FR8BID_SYNTHETIC_SECRET: 'synthetic'
      }
    });
    expect(result.status, `${args[0]}: ${result.error ?? ''}\n${result.stderr ?? ''}${result.stdout ?? ''}`).toBe(expected);
  };
  {
    mkdirSync(join(dir, 'scripts/agentes'), { recursive: true });
    for (const file of ['codex.mjs', 'nucleo.mjs']) cpSync(resolve('scripts/agentes', file), join(dir, 'scripts/agentes', file));
    writeFileSync(join(dir, '.gitignore'), '.agentes\nnode_modules\n');
    writeFileSync(join(dir, 'probe.cjs'), `const fs = require('node:fs');
if (process.env.FR8BID_SYNTHETIC_SECRET) process.exit(19);
fs.mkdirSync('.agentes', { recursive: true });
fs.appendFileSync('.agentes/pruebas.txt', 'ran\\n');`);
    writeFileSync(join(dir, 'fake.mjs'), `import {writeFileSync} from 'node:fs';
if (process.argv[2] === 'exec') {
  for await (const chunk of process.stdin) { /* consume prompt */ }
  const output = process.argv[process.argv.indexOf('--output-last-message') + 1];
  if (process.argv.includes('workspace-write')) writeFileSync('delegado.txt', 'delegado');
  writeFileSync(output, 'VEREDICTO: APROBADO');
}`);
    writeFileSync(join(dir, win ? 'fake.cmd' : 'fake'), win ? '@echo off\r\nnode "%~dp0fake.mjs" %*\r\n' : '#!/bin/sh\nexec node "$(dirname "$0")/fake.mjs" "$@"\n', { mode: 0o755 });
    // Sustituye npm/npx por un proceso local que deja evidencia de ejecución.
    mkdirSync(bin, { recursive: true });
    for (const command of ['npm', 'npx']) {
      writeFileSync(join(bin, command + (win ? '.cmd' : '')), win ? '@node probe.cjs\r\n' : '#!/bin/sh\nexec node probe.cjs\n', { mode: 0o755 });
    }
    git(['init', '--quiet', '-b', 'claude/fixture']);
    git(['config', 'user.name', 'Synthetic']);
    git(['config', 'user.email', 'synthetic@example.invalid']);
    git(['config', 'core.hooksPath', '/dev/null']);
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'base']);
    const args = ['--nombre', 'fixture'];
    run(['delegar', ...args, '--tarea', 'Fixture'], 0);
    expect(existsSync(marker)).toBe(false);
    run(['verificar', ...args], 1);
    run(['verificar'], 1, work);
    expect(existsSync(marker)).toBe(false);

    run(['revisar', ...args], 0);
    const revision = () => JSON.parse(readFileSync(join(record, 'fixture.revision.json'), 'utf8')).id;
    const primera = revision();
    git(['commit', '--quiet', '--allow-empty', '-m', 'cambio de commit'], work);
    run(['verificar', ...args, '--revision', primera], 1);
    expect(existsSync(marker)).toBe(false);
    run(['revisar', ...args], 0);
    run(['verificar', ...args, '--revision', revision()], 0);
    expect(readFileSync(marker, 'utf8')).toBe('ran\n'.repeat(4));
    run(['revisar', ...args], 0);
    run(['integrar', ...args], 1);
    run(['verificar', ...args, '--revision', revision()], 0);
    run(['integrar', ...args], 0);
    expect(readFileSync(join(dir, 'delegado.txt'), 'utf8')).toBe('delegado');
  }
}, 90_000);
