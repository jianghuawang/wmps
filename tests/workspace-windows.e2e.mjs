import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const electronPath = resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const testRoot = await mkdtemp(`${tmpdir()}/wmps-workspaces-e2e-`); const userData = join(testRoot, 'user-data'); const workspaceA = join(testRoot, 'workspace-alpha'); const workspaceB = join(testRoot, 'workspace-beta');
await Promise.all([mkdir(workspaceA, { recursive: true }), mkdir(workspaceB, { recursive: true })]); await Promise.all([writeFile(join(workspaceA, 'alpha.md'), '# Alpha workspace\n'), writeFile(join(workspaceB, 'beta.md'), '# Beta workspace\n')]);

async function freePort() { return new Promise((resolvePort, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); const selected = typeof address === 'object' && address ? address.port : 0; server.close(() => resolvePort(selected)); }); }); }
async function launch(workspace, tab, port) { return spawn(electronPath, [`--remote-debugging-port=${port}`, '.'], { env: { ...process.env, WMPS_USER_DATA: userData, WMPS_TEST_WORKSPACE: workspace, WMPS_TEST_TABS: tab }, stdio: ['ignore', 'ignore', 'pipe'] }); }
async function targets(port) { for (let attempt = 0; attempt < 60; attempt += 1) { try { const result = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json()); if (result.some((entry) => entry.type === 'page')) return result; } catch { /* Electron is still starting. */ } await delay(100); } throw new Error('Electron renderer did not start'); }
async function stop(process) { const exited = new Promise((resolveExit) => process.once('exit', resolveExit)); process.kill('SIGKILL'); await exited; }
async function connect(target) { const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }); }); let sequence = 0; const pending = new Map(); socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); const request = pending.get(message.id); if (!request) return; pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }); const call = (method, params = {}) => new Promise((resolveCall, reject) => { const id = ++sequence; pending.set(id, { resolve: resolveCall, reject }); socket.send(JSON.stringify({ id, method, params })); }); return { socket, call, evaluate: async (expression) => { const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (response.exceptionDetails) throw new Error(response.exceptionDetails.text); return response.result.value; } }; }

let first; let second; let connection;
try {
  const firstPort = await freePort(); first = await launch(workspaceA, join(workspaceA, 'alpha.md'), firstPort); await targets(firstPort); await delay(500); await stop(first); first = null;
  const secondPort = await freePort(); second = await launch(workspaceB, join(workspaceB, 'beta.md'), secondPort); const initialTargets = await targets(secondPort); connection = await connect(initialTargets.find((entry) => entry.type === 'page'));
  for (let attempt = 0; attempt < 40 && !(await connection.evaluate("Boolean(document.querySelector('.workspace-title-button'))")); attempt += 1) await delay(100);
  await connection.evaluate("document.querySelector('.workspace-title-button').click()"); await delay(150);
  const library = await connection.evaluate(`(() => ({ rows: [...document.querySelectorAll('.workspace-list>button')].map((button) => ({ text: button.innerText, current: button.classList.contains('current') })), heading: document.querySelector('.workspace-switcher h2')?.textContent }))()`);
  if (library.rows.length !== 2 || !library.rows.some((row) => row.text.includes('workspace-alpha')) || !library.rows.some((row) => row.text.includes('workspace-beta') && row.current)) throw new Error(`Workspace library is incomplete: ${JSON.stringify(library)}`);
  if (process.env.WMPS_E2E_SCREENSHOT) { const screenshot = await connection.call('Page.captureScreenshot', { format: 'png' }); await writeFile(resolve(process.env.WMPS_E2E_SCREENSHOT), Buffer.from(screenshot.data, 'base64')); }
  await connection.evaluate("[...document.querySelectorAll('.workspace-list>button')].find((button) => button.innerText.includes('workspace-alpha')).click()");
  let pages = [];
  for (let attempt = 0; attempt < 50; attempt += 1) { pages = (await fetch(`http://127.0.0.1:${secondPort}/json`).then((response) => response.json())).filter((entry) => entry.type === 'page'); if (pages.length === 2) break; await delay(100); }
  if (pages.length !== 2) throw new Error(`Expected two WMPS windows, found ${pages.length}`);
  const texts = [];
  for (const page of pages) { const pageConnection = await connect(page); let text = ''; for (let attempt = 0; attempt < 40; attempt += 1) { text = await pageConnection.evaluate("document.body?.innerText ?? ''"); if (text.includes('.md')) break; await delay(100); } texts.push(text); pageConnection.socket.close(); }
  if (!texts.some((text) => text.includes('alpha.md')) || !texts.some((text) => text.includes('beta.md'))) throw new Error('Workspace windows did not restore their independent tabs');
  console.log(JSON.stringify({ recentRows: library.rows.length, windows: pages.length, restoredTabs: ['alpha.md', 'beta.md'] }));
} finally {
  connection?.socket.close(); if (first) await stop(first); if (second) await stop(second); await rm(testRoot, { recursive: true, force: true });
}
