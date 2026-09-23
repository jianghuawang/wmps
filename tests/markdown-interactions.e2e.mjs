import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); const selected = typeof address === 'object' && address ? address.port : 0; server.close(() => resolvePort(selected)); });
});
const workspace = resolve('fixtures'); const fixture = resolve(workspace, 'markdown-interactions.md');
const userData = await mkdtemp(`${tmpdir()}/wmps-markdown-e2e-`);
const electron = spawn(resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), [`--remote-debugging-port=${port}`, '.'], { env: { ...process.env, WMPS_USER_DATA: userData, WMPS_TEST_WORKSPACE: workspace, WMPS_TEST_TABS: fixture }, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = ''; electron.stderr.on('data', (chunk) => { stderr += String(chunk); });

let socket;
try {
  let targets;
  for (let attempt = 0; attempt < 60; attempt += 1) { try { targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json()); if (targets.length) break; } catch { /* Electron is still starting. */ } await delay(100); }
  const target = targets?.find((entry) => entry.type === 'page'); if (!target) throw new Error(`No renderer target. ${stderr}`);
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0; const pending = new Map();
  socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); const request = pending.get(message.id); if (!request) return; pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); });
  const call = (method, params = {}) => new Promise((resolveCall, reject) => { const id = ++sequence; pending.set(id, { resolve: resolveCall, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const response = await call('Runtime.evaluate', { expression, returnByValue: true }); if (response.exceptionDetails) throw new Error(response.exceptionDetails.text); return response.result.value; };
  for (let attempt = 0; attempt < 40 && !(await evaluate("Boolean(document.querySelector('.markdown-preview'))")); attempt += 1) await delay(100);
  await evaluate(`document.querySelector('.markdown-preview').scrollTop = 0; document.querySelector('.cm-scroller').scrollTop = 0`); await delay(250);
  const geometry = await evaluate(`(() => { const preview = document.querySelector('.markdown-preview'); const rect = preview.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, max: preview.scrollHeight - preview.clientHeight }; })()`);
  const positions = [];
  for (let index = 0; index < 30; index += 1) { await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: geometry.x, y: geometry.y, deltaX: 0, deltaY: 40 }); await delay(80); positions.push(await evaluate("document.querySelector('.markdown-preview').scrollTop")); }
  const unexpectedSteps = positions.flatMap((position, index) => { if (index === 0 || positions[index - 1] >= geometry.max - 1) return []; const delta = position - positions[index - 1]; return delta < 20 || delta > 55 ? [{ index, delta }] : []; });
  if (unexpectedSteps.length || positions.at(-1) < Math.min(geometry.max * .65, 800)) throw new Error(`Preview scroll jumped or stalled: ${JSON.stringify({ geometry, positions, unexpectedSteps })}`);
  const before = await evaluate(`(() => { const divider = document.querySelector('.markdown-split-handle').getBoundingClientRect(); return { x: divider.x + divider.width / 2, y: divider.y + divider.height / 2, source: document.querySelector('.markdown-source').getBoundingClientRect().width, preview: document.querySelector('.markdown-preview-shell').getBoundingClientRect().width }; })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: before.x, y: before.y, button: 'left', buttons: 1, clickCount: 1 }); await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.x + 160, y: before.y, button: 'left', buttons: 1 }); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: before.x + 160, y: before.y, button: 'left', buttons: 0, clickCount: 1 }); await delay(150);
  const after = await evaluate(`(() => ({ source: document.querySelector('.markdown-source').getBoundingClientRect().width, preview: document.querySelector('.markdown-preview-shell').getBoundingClientRect().width, value: Number(document.querySelector('.markdown-split-handle').getAttribute('aria-valuenow')) }))()`);
  if (after.source < before.source + 130 || after.preview > before.preview - 130 || after.value <= 50) throw new Error(`Divider did not resize both panels: ${JSON.stringify({ before, after })}`);
  console.log(JSON.stringify({ scrollSteps: positions.length, finalScrollTop: positions.at(-1), divider: { before, after } }));
} finally {
  socket?.close(); const exited = new Promise((resolveExit) => electron.once('exit', resolveExit)); electron.kill('SIGKILL'); await exited; await rm(userData, { recursive: true, force: true });
}
