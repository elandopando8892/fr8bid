/* Real hook + React DOM, controlled promises; loopback only, no auth or APIs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve('.test-output/use-async-race');
const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAsync } from './src/bidware/components/useAsync';
let jobs = [], reportJobs = () => {};
function Probe({ target }) {
  const state = useAsync(() => new Promise((resolve, reject) => {
    jobs.push({ id: jobs.length + 1, target, resolve, reject });
    reportJobs([...jobs]);
  }), [target]);
  return <section>
    <output data-testid="data">{state.data ?? 'empty'}</output>
    <output data-testid="loading">{String(state.loading)}</output>
    <output data-testid="error">{state.error ?? 'none'}</output>
    <button onClick={state.reload}>Reload</button>
  </section>;
}
function App() {
  const [target, setTarget] = useState('A');
  const [mounted, setMounted] = useState(true);
  const [visibleJobs, setJobs] = useState([]);
  reportJobs = setJobs;
  return <>
    <button onClick={() => setTarget('B')}>Select B</button>
    <button onClick={() => setMounted(v => !v)}>Toggle mount</button>
    {mounted && <Probe target={target} />}
    {visibleJobs.map(job => <div key={job.id}>
      <button onClick={() => job.resolve(job.target + ':' + job.id)}>Resolve {job.id}</button>
      <button onClick={() => job.reject(new Error('failure:' + job.id))}>Reject {job.id}</button>
    </div>)}
  </>;
}
const app = <App />;
createRoot(document.getElementById('root')).render(
  location.search === '?strict' ? <React.StrictMode>{app}</React.StrictMode> : app
);
`;

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"development"' } });
  const script = bundle.outputFiles[0].text;
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(script); }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  const results = [], unexpected = [], pageErrors = [];
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      unexpected.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => pageErrors.push(error.message));
    const click = name => page.getByRole('button', { name, exact: true }).click();
    const waitJob = id => page.getByRole('button', { name: 'Resolve ' + id, exact: true }).waitFor();
    const snapshot = () => page.evaluate(() => Object.fromEntries(['data', 'loading', 'error'].map(key =>
      [key, document.querySelector('[data-testid="' + key + '"]').textContent])));
    const settle = async (button, expected) => {
      await click(button);
      // Let React flush the promise chain and DOM; no timing-based sleep.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const actual = await snapshot();
      assert.deepEqual(actual, expected); return actual;
    };
    await page.goto(origin); await waitJob(1);
    await click('Select B'); await waitJob(2);
    await settle('Resolve 2', { data: 'B:2', loading: 'false', error: 'none' });
    results.push({ scenario: 'older success after changed selection', state:
      await settle('Resolve 1', { data: 'B:2', loading: 'false', error: 'none' }) });
    if (!process.argv.includes('--probe')) {
      await click('Reload'); await waitJob(3);
      await click('Reload'); await waitJob(4);
      await settle('Resolve 4', { data: 'B:4', loading: 'false', error: 'none' });
      results.push({ scenario: 'older reload rejection after newer success', state:
        await settle('Reject 3', { data: 'B:4', loading: 'false', error: 'none' }) });
      await click('Reload'); await waitJob(5);
      await click('Reload'); await waitJob(6);
      results.push({ scenario: 'older rejection cannot finish current loading', state:
        await settle('Reject 5', { data: 'B:4', loading: 'true', error: 'none' }) });
      await settle('Reject 6', { data: 'B:4', loading: 'false', error: 'failure:6' });
      await click('Reload'); await waitJob(7);
      results.push({ scenario: 'current error and deliberate recovery', state:
        await settle('Resolve 7', { data: 'B:7', loading: 'false', error: 'none' }) });
      await click('Reload'); await waitJob(8);
      await click('Toggle mount'); await click('Toggle mount'); await waitJob(9);
      results.push({ scenario: 'unmounted request cannot finish remounted loading', state:
        await settle('Resolve 8', { data: 'empty', loading: 'true', error: 'none' }) });
      await settle('Resolve 9', { data: 'B:9', loading: 'false', error: 'none' });
      await page.goto(origin + '/?strict'); await waitJob(2);
      await settle('Resolve 2', { data: 'A:2', loading: 'false', error: 'none' });
      results.push({ scenario: 'StrictMode cleanup keeps earlier effect inactive', state:
        await settle('Resolve 1', { data: 'A:2', loading: 'false', error: 'none' }) });
    }
    assert.deepEqual(unexpected, []); assert.deepEqual(pageErrors, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ results, unexpected, pageErrors }, null, 2));
    console.log(JSON.stringify({ passed: results.length, unexpected, pageErrors }));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
