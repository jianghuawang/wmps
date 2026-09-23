// Capture the actual Electron app with fictional documents and isolated settings.
import { spawn } from 'node:child_process';
import { mkdtemp, cp, writeFile, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const delay = ms => new Promise(r => setTimeout(r, ms));
const root = await mkdtemp(join(tmpdir(), 'wmps-demo-'));
const workspace = join(root, 'Harbor Studio');
await cp(resolve('examples/Harbor Studio'), workspace, { recursive: true });
const port = await new Promise(r => { const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));}); });
const paths = ['Welcome.md','Plans/Launch brief.docx','Finance/Collection budget.xlsx','Reference/Collection guide.pdf'].map(p=>join(workspace,p));
const proc=spawn(process.env.WMPS_APP_BINARY || resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), [`--remote-debugging-port=${port}`, ...(process.env.WMPS_APP_BINARY ? [] : ['.'])], {env:{...process.env,WMPS_USER_DATA:join(root,'state'),WMPS_TEST_WORKSPACE:workspace,WMPS_TEST_TABS:paths.join(',')},stdio:['ignore','ignore','pipe']});
let stderr='';proc.stderr.on('data',b=>stderr+=b);let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) { try { target = (await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())).find(t => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  assert(target, stderr); socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => socket.addEventListener('open', r, { once: true })); let sequence = 0; const pending = new Map();
  socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); } throw new Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText')); };
  const screenshot = async name => { await mkdir('docs/images', { recursive: true }); const { data } = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(`docs/images/${name}.png`, Buffer.from(data, 'base64')); };
  const tab = async name => { await evaluate(`[...document.querySelectorAll('.document-tab')].find(e=>e.textContent.includes(${JSON.stringify(name)})).click()`); await delay(300); };
  await wait("document.querySelector('.markdown-preview')?.textContent.includes('Harbor Studio')");
  await evaluate("window.wmps.setTheme('light')");
  await tab('Launch brief.docx');
  await wait("document.querySelector('.comment-card[data-linked=true]')");
  await evaluate("document.querySelector('.comment-card').click()");
  await wait("document.querySelector('.docx-comment-band--active')");
  await delay(400); await screenshot('word-comments');
  await tab('Welcome.md');
  await evaluate("window.wmps.setTheme('dark')");
  await delay(400); await screenshot('markdown');
  console.log('Captured fictional demo screenshots in docs/images');
} finally {socket?.close();const exited=new Promise(r=>proc.once('exit',r));proc.kill('SIGKILL');await exited;await rm(root,{recursive:true,force:true});}
