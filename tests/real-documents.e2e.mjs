import { spawn } from 'node:child_process';
import { mkdtemp, cp, readFile, writeFile, mkdir, realpath, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const delay = ms => new Promise(r => setTimeout(r, ms));
// Optional local-corpus validation. Documents are copied and originals are hashed.
// Usage: node tests/real-documents.e2e.mjs /path/to/documents
import { unzipSync, strFromU8 } from 'fflate';
if (!process.argv[2]) throw new Error('Provide a folder of Markdown, DOCX and PDF documents as the first argument.');
const source = resolve(process.argv[2]);
async function inventory(folder, prefix = '') {
  const rows = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) { rows.push(...await inventory(join(folder, entry.name), relative + '/')); continue; }
    if (!/\.(md|docx|pdf)$/i.test(entry.name)) continue;
    const bytes = await readFile(join(folder,entry.name));
    let archive = {}; try { archive = unzipSync(bytes); } catch { /* Plain text or PDF. */ }
    const comments = archive['word/comments.xml'] ? (strFromU8(archive['word/comments.xml']).match(/<(?:\w+:)?comment\b/g) || []).length : 0;
    rows.push({path:relative,sha256:createHash('sha256').update(bytes).digest('hex'),docx:Boolean(archive['word/document.xml']),comments});
  }
  return rows;
}
const manifest = (await inventory(source)).filter(row => !process.env.WMPS_TEST_FILE || row.path === process.env.WMPS_TEST_FILE);
const root=await realpath(await mkdtemp(join(tmpdir(),'wmps-real-validation-')));
const workspace=join(root,'document-workspace');
for(const row of manifest){const path=join(workspace,row.path);await mkdir(dirname(path),{recursive:true});await cp(join(source,row.path),path);}
const port=await new Promise(r=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>r(p));});});
const proc=spawn(process.env.WMPS_APP_BINARY || resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),[`--remote-debugging-port=${port}`,...(process.env.WMPS_APP_BINARY ? []:['.'])],{env:{...process.env,WMPS_USER_DATA:join(root,'state'),WMPS_TEST_WORKSPACE:workspace,WMPS_TEST_TABS:''},stdio:['ignore','ignore','pipe']});
let stderr = ''; proc.stderr.on('data', b => stderr += b); let socket;
try {
  let target;
  for (let i = 0; i < 100; i++) { try { target = (await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())).find(t => t.type === 'page'); if (target) break; } catch {} await delay(100); }
  assert(target, stderr); socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => socket.addEventListener('open', r, { once: true })); let sequence = 0; const pending = new Map();
  socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(100); } await writeFile(join(root,'failure.html'),await evaluate('document.body.outerHTML')); const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'failure.png'),Buffer.from(shot.data,'base64')); throw new Error('Timed out: ' + expression+' '+root+' '+stderr.slice(-1800)); };
  const screenshot = async name => {  const { data } = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(root, `${name}.png`), Buffer.from(data, 'base64')); };
  const tab = async name => { await evaluate(`[...document.querySelectorAll('.document-tab')].find(e=>e.textContent.includes(${JSON.stringify(name)})).click()`); await delay(300); };
  await wait("document.querySelector('.tree-row')");
  const report=[]; const navigation=[];
  for(const [i,row] of manifest.entries()){
    const path=join(workspace,row.path);
    for(const ancestor of row.path.split('/').slice(0,-1).map((_,n)=>join(workspace,...row.path.split('/').slice(0,n+1)))){
      await evaluate(`(()=>{const el=document.querySelector('[data-path='+CSS.escape(${JSON.stringify(ancestor)})+']');if(el && !el.parentElement.querySelector('.tree-node'))el.click();})()`);
    }
    await evaluate(`document.querySelector('[data-path='+CSS.escape(${JSON.stringify(path)})+']').click()`);
    const kind=row.docx?'word':row.path.endsWith('.docx')?'word':row.path.endsWith('.pdf')?'pdf':'markdown';
    await wait("document.querySelector('.document-tab.active')");
    await wait(kind==='word'?"document.querySelector('.docx-pages')?.textContent.length > 0":kind==='pdf'?"document.querySelector('.pdf-page canvas')?.width > 0":"document.querySelector('.cm-content')");
    await delay(200);
    const count=await evaluate("document.querySelectorAll('.comment-entry').length");
    assert.equal(count,row.comments || 0,`Comment count: ${row.path}`);
    const error=await evaluate("document.querySelector('.editor-error')?.textContent || document.querySelector('.error-banner')?.textContent || ''");assert(!error,`Editor failed: ${row.path}`);
    if(count){
      await wait("document.querySelector('.comment-card[data-linked=true]')");
      const jumpCount = await evaluate("document.querySelectorAll('.comment-card[data-linked=true]').length");
      assert.equal(await evaluate("document.querySelectorAll('.comment-jump').length"), 0);
      for(const index of Array.from({length:jumpCount},(_,i)=>i)) {
        await evaluate(`(()=>{const b=document.querySelectorAll('.comment-card[data-linked=true]')[${index}];b.scrollIntoView({block:'center'});b.click();})()`);
        await wait(`document.querySelectorAll('.comment-card[data-linked=true]')[${index}]?.dataset.nativeActive === 'true'`);
        await wait("document.querySelector('.docx-comment-band--active, .docx-comment-band--resolved-active')");
        const status = 'found';
        navigation.push({path:row.path,index,status});
      }

      // Actual pointer input on highlighted document text must activate its comment.
      await evaluate("document.querySelector('.docx-comment-band').scrollIntoView({block:'center'})");
      await delay(150);
      const first = await evaluate("(()=>{const b=document.querySelector('.docx-comment-band').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()");
      await call('Input.dispatchMouseEvent',{type:'mouseMoved',...first});
      await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...first});
      await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...first});
      await delay(180);
      await wait("document.querySelector('.active-comment') && document.querySelector('.docx-comment-band--active')");
      if(i === 0) {
        const oldZoom=await evaluate("document.querySelector('.word-editor').dataset.documentZoom");
        await evaluate("document.querySelector('.word-engine').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-100}))");
        await wait(`document.querySelector('.word-editor').dataset.documentZoom !== ${JSON.stringify(oldZoom)}`);
        await wait("document.querySelector('.docx-comment-band--active') && document.querySelector('.comment-connector path')");
      }
      await writeFile(join(root,`document-${i}.html`),await evaluate('document.body.outerHTML'));
      const geometry=await evaluate("(()=>{const p=document.querySelector('.word-comments').getBoundingClientRect();const list=document.querySelector('.comments-list');return {width:p.width,height:p.height,scroll:list.scrollHeight,visible:list.clientHeight,threads:document.querySelectorAll('.comment-card').length};})()");
      assert(geometry.width>=300 && geometry.height>400);
      await screenshot(`document-${String(i).padStart(2,'0')}`);
      report.push({path:row.path,kind,comments:count,...geometry});
    }else {await screenshot(`document-${String(i).padStart(2,'0')}`);report.push({path:row.path,kind,comments:0});}
    await evaluate("document.querySelector('.document-tab.active .tab-close').click()");
    await wait("!document.querySelector('.document-tab.active')");
  }
  assert.equal(navigation.filter(item => item.status !== 'found').length, 0, 'Comment navigation failures');
  await writeFile(join(root,'dom.html'),await evaluate('document.body.outerHTML'));
  const queries=(process.env.WMPS_TEST_QUERIES || 'collection,brief,studio').split(',');
  const search=[];
  for(const query of queries){const hits=await evaluate(`window.wmps.searchWorkspace(${JSON.stringify(workspace)},${JSON.stringify(query)})`);search.push({query,count:hits.length,word:hits.filter(h=>h.path.endsWith('.docx')).length,comments:hits.filter(h=>h.location?.startsWith('Comment')).length,pdf:hits.filter(h=>h.path.endsWith('.pdf')).length});}
  assert(search.some(s=>s.word>0));assert(search.some(s=>s.comments>0));
  await evaluate("document.querySelector('[aria-label=\"Search workspace\"]').click()");
  await wait("document.querySelector('.search-panel input')");
  await evaluate(`(()=>{const el=document.querySelector('.search-panel input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(queries[0])});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait("document.querySelectorAll('.search-results button').length > 0");
  await screenshot('search-results');
  await evaluate("[...document.querySelectorAll('.search-results button')].find(b=>b.textContent.includes('Comment')).click()");
  await wait("document.querySelector('.word-comments .active-comment')");
  await screenshot('search-comment-open');
  for(const row of manifest)assert.equal(createHash('sha256').update(await readFile(join(source,row.path))).digest('hex'),row.sha256,'Original changed: '+row.path);
  await writeFile(join(root,'report.json'),JSON.stringify({files:report,search,navigation,originalsUnchanged:true},null,2));
  console.log(JSON.stringify({navigationTested:navigation.length,navigationFailures:navigation.filter(n=>n.status!=='found'),opened:report.length,commented:report.filter(r=>r.comments).length,comments:report.reduce((n,r)=>n+r.comments,0),search,originalsUnchanged:true,report:join(root,'report.json')}));
}finally{socket?.close();const exited=new Promise(r=>proc.once('exit',r));proc.kill('SIGKILL');await exited;}
