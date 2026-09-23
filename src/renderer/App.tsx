import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, Languages, PanelLeftClose, PanelLeftOpen, Search, Files, FolderOpen, Sun, Moon, Save, Plus, X } from 'lucide-react';
import { Document, Packer, Paragraph } from 'docx';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import { basename } from './utils/path';
import { classifyFile, isEditable, saveTargetForLegacy, type FileKind } from '../shared/file-types';
import type { FileSnapshot, MenuCommand, SessionState, TreeNode } from '../shared/contracts';
import type { EditorHandle, EditorViewState } from './editors/types';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { Welcome } from './components/Welcome';
import { CommandPalette } from './components/CommandPalette';
import { SearchPanel } from './components/SearchPanel';
import { EditorErrorBoundary } from './components/ErrorBoundary';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher';

const MarkdownEditor = lazy(() => import('./editors/MarkdownEditor'));
const WordEditor = lazy(() => import('./editors/WordEditor'));
const SpreadsheetEditor = lazy(() => import('./editors/SpreadsheetEditor'));
const HtmlViewer = lazy(() => import('./editors/HtmlViewer'));
const PdfViewer = lazy(() => import('./editors/PdfViewer'));

interface TabModel extends FileSnapshot { name: string; kind: FileKind; dirty: boolean; viewState?: EditorViewState; externalChanged?: boolean; }

function replaceTab(tabs: TabModel[], path: string, update: (tab: TabModel) => TabModel) { return tabs.map((tab) => tab.path === path ? update(tab) : tab); }

function Unsupported({ path }: { path: string }) { const { t } = useTranslation(); return <div className="unsupported-editor"><h2>{t('unsupported')}</h2><button onClick={() => window.wmps.revealPath(path)}>{t('reveal')}</button></div>; }

// Keep each editor mounted, with stable callbacks, while its tab is open.
const DocumentPane = memo(function DocumentPane({ tab, visible, markDirty, handles }: {
  tab: TabModel; visible: boolean; markDirty(path: string, dirty: boolean): void;
  handles: React.RefObject<Map<string, EditorHandle>>;
}) {
  const onDirtyChange = useCallback((dirty: boolean) => markDirty(tab.path, dirty), [tab.path, markDirty]);
  const registerHandle = useCallback((handle: EditorHandle | null) => { if (handle) handles.current.set(tab.path, handle); else handles.current.delete(tab.path); }, [tab.path, handles]);
  const initialState = useRef(tab.viewState).current;
  const props = { path: tab.path, bytes: tab.bytes, initialState, onDirtyChange, registerHandle };
  const Component = tab.kind === 'markdown' ? MarkdownEditor : ['word', 'word-legacy'].includes(tab.kind) ? WordEditor : ['spreadsheet', 'spreadsheet-legacy', 'csv'].includes(tab.kind) ? SpreadsheetEditor : tab.kind === 'pdf' ? PdfViewer : HtmlViewer;
  return <div className="document-pane" hidden={!visible}><EditorErrorBoundary path={tab.path}><Suspense fallback={<div className="engine-loading">Opening {tab.name}…</div>}><Component {...props}/></Suspense></EditorErrorBoundary></div>;
});

export default function App() {
  const { t, i18n } = useTranslation(); const [tree, setTree] = useState<TreeNode | null>(null); const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null); const [tabs, setTabs] = useState<TabModel[]>([]); const [activePath, setActivePath] = useState<string | null>(null); const [sidebarVisible, setSidebarVisible] = useState(true); const [sidebarWidth, setSidebarWidth] = useState(260); const [resizingSidebar, setResizingSidebar] = useState(false); const [recents, setRecents] = useState<string[]>([]); const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false); const [quickOpen, setQuickOpen] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const handles = useRef(new Map<string, EditorHandle>()); const recoveryTimers = useRef(new Map<string, number>()); const restoring = useRef(true); const tabsRef = useRef<TabModel[]>([]);
  tabsRef.current = tabs;
  const [dark, setDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const [error, setError] = useState('');
  const [nameDialog, setNameDialog] = useState<{ title: string; value: string; resolve(value: string | null): void } | null>(null);
  const requestName = useCallback((title: string, value: string) => new Promise<string | null>((resolve) => setNameDialog({ title, value, resolve })), []);
  const finishName = (value: string | null) => { nameDialog?.resolve(value); setNameDialog(null); };
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(media.matches); media.addEventListener('change', update);
    const onError = (event: PromiseRejectionEvent) => { event.preventDefault(); setError(event.reason?.message || String(event.reason)); };
    window.addEventListener('unhandledrejection', onError);
    return () => { media.removeEventListener('change', update); window.removeEventListener('unhandledrejection', onError); };
  }, []);
  const active = tabs.find((tab) => tab.path === activePath) ?? null;

  const openWorkspace = useCallback(async (root: string) => {
    setTree(await window.wmps.openWorkspace(root)); setWorkspaceRoot(root); setRecents(await window.wmps.getRecentWorkspaces());
  }, []);

  const openWorkspaceWindow = useCallback(async (root?: string | null) => {
    const opened = await window.wmps.openWorkspaceWindow(root); if (opened) setRecents(await window.wmps.getRecentWorkspaces()); setWorkspaceSwitcherOpen(false);
  }, []);

  const openFile = useCallback(async (path: string, viewState?: EditorViewState) => {
    if (classifyFile(path) === 'unsupported') { await window.wmps.revealPath(path); return; }
    if (tabsRef.current.some((tab) => tab.path === path)) { setActivePath(path); setQuickOpen(false); return; }
    const snapshot = await window.wmps.readFile(path); const recovery = await window.wmps.loadRecovery(path); const useRecovery = recovery && recovery.savedAt > snapshot.mtimeMs;
    setTabs((current) => [...current, { ...snapshot, bytes: useRecovery ? recovery.bytes : snapshot.bytes, name: basename(path), kind: snapshot.detectedKind ?? classifyFile(path), dirty: Boolean(useRecovery), viewState }]); setActivePath(path); setQuickOpen(false);
  }, []);

  const activateTab = useCallback((path: string) => {
    if (activePath) { const viewState = handles.current.get(activePath)?.getViewState(); if (viewState) setTabs((current) => replaceTab(current, activePath, (tab) => ({ ...tab, viewState }))); }
    setActivePath(path);
  }, [activePath]);

  const reloadFile = useCallback(async (path: string) => {
    const snapshot = await window.wmps.readFile(path);
    setTabs((current) => replaceTab(current, path, (tab) => ({ ...tab, ...snapshot, bytes: snapshot.bytes, dirty: false, externalChanged: false })));
    await window.wmps.deleteRecovery(path);
  }, []);

  const chooseFiles = useCallback(async () => { for (const path of await window.wmps.chooseFiles()) await openFile(path); }, [openFile]);

  const saveTab = useCallback(async (path: string) => {
    const tab = tabs.find((candidate) => candidate.path === path); const handle = handles.current.get(path); if (!tab || !tab.dirty) return true; if (!handle) return false;
    const bytes = await handle.serialize(); const target = tab.kind === 'word' && classifyFile(path) === 'markdown' ? path.replace(/\.md$/i, '-converted.docx') : saveTargetForLegacy(path); clearTimeout(recoveryTimers.current.get(path));
    try {
      const snapshot = await window.wmps.writeFile({ path: target, bytes: bytes.slice(), expectedMtimeMs: target === path ? tab.mtimeMs : undefined });
      await window.wmps.deleteRecovery(path);
      setTabs((current) => current.map((item) => item.path === path ? { ...item, ...snapshot, bytes: target === path ? item.bytes : snapshot.bytes, path: target, name: basename(target), kind: classifyFile(target), dirty: false, externalChanged: false } : item));
      if (target !== path) { handles.current.set(target, handle); handles.current.delete(path); setActivePath(target); }
      return true;
    } catch (error) { if ((error as Error).message.includes('FILE_CHANGED_ON_DISK')) { setTabs((current) => replaceTab(current, path, (item) => ({ ...item, externalChanged: true }))); return false; } throw error; }
  }, [tabs]);

  const closeTab = useCallback(async (path: string) => {
    const tab = tabs.find((item) => item.path === path); if (!tab) return;
    if (tab.dirty) { const decision = await window.wmps.confirmUnsaved([tab.name], false); if (decision === 'cancel') return; if (decision === 'save' && !await saveTab(path)) return; }
    clearTimeout(recoveryTimers.current.get(path)); await window.wmps.deleteRecovery(path);
    setTabs((current) => current.filter((item) => item.path !== path)); if (activePath === path) { const index = tabs.findIndex((item) => item.path === path); setActivePath(tabs[index + 1]?.path ?? tabs[index - 1]?.path ?? null); } handles.current.delete(path);
  }, [tabs, activePath, saveTab]);

  const markDirty = useCallback((path: string, dirty: boolean) => {
    setTabs((current) => replaceTab(current, path, (tab) => ({ ...tab, dirty })));
    clearTimeout(recoveryTimers.current.get(path));
    if (dirty) recoveryTimers.current.set(path, window.setTimeout(async () => { const tab = tabsRef.current.find((item) => item.path === path); const handle = handles.current.get(path); if (!tab || !handle) return; try { await window.wmps.saveRecovery({ path, bytes: (await handle.serialize()).slice(), savedAt: Date.now(), sourceMtimeMs: tab.mtimeMs }); } catch (error) { console.warn('Recovery snapshot could not be saved', error); } }, 1400));
  }, []);

  const newFile = useCallback(async (kind: 'markdown' | 'word' | 'spreadsheet', directory = workspaceRoot) => {
    if (!workspaceRoot) { await openWorkspaceWindow(); return; }
    const defaultName = kind === 'markdown' ? 'Untitled.md' : kind === 'word' ? 'Untitled.docx' : 'Untitled.xlsx'; const name = (await requestName('New document', defaultName))?.trim(); if (!name || !directory || /[\\/]/.test(name) || name === '.' || name === '..') return; if (classifyFile(name) !== kind) throw new Error('Keep the .' + defaultName.split('.').pop() + ' extension for this document.'); const path = `${directory}/${name}`;
    let bytes: Uint8Array;
    if (kind === 'markdown') bytes = new TextEncoder().encode('---\ntitle: Untitled\n---\n\n# Untitled\n');
    else if (kind === 'word') bytes = new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('')] }] })));
    else { const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1'); bytes = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })); }
    await window.wmps.createFile(path, bytes); if (workspaceRoot) setTree(await window.wmps.openWorkspace(workspaceRoot)); await openFile(path);
  }, [workspaceRoot, openWorkspaceWindow, openFile]);

  const command = useCallback(async (value: MenuCommand | string) => {
    if (value === 'open-folder') await openWorkspaceWindow(); else if (value === 'open-file') await chooseFiles(); else if (value === 'save' && activePath) await saveTab(activePath); else if (value === 'save-all') for (const tab of tabs) await saveTab(tab.path); else if (value === 'close-tab' && activePath) await closeTab(activePath); else if (value === 'toggle-sidebar') setSidebarVisible((visible) => !visible); else if (value === 'quick-open') setQuickOpen(true); else if (value === 'workspace-search' && workspaceRoot) { setSidebarVisible(true); setSearchOpen(true); } else if (value === 'find' && activePath) handles.current.get(activePath)?.focusSearch(); else if ((value === 'zoom-in' || value === 'zoom-out') && activePath) handles.current.get(activePath)?.zoomBy?.(value === 'zoom-in' ? 1.1 : 1 / 1.1); else if (value === 'new-markdown') await newFile('markdown'); else if (value === 'new-word') await newFile('word'); else if (value === 'new-spreadsheet') await newFile('spreadsheet');
    else if (value.startsWith('rename:')) {
      const path = value.slice('rename:'.length); const currentName = basename(path); const name = (await requestName('Rename', currentName))?.trim();
      if (!name || name === currentName || name.includes('/') || name.includes('\\')) return;
      const nextPath = `${path.slice(0, path.length - currentName.length)}${name}`; await window.wmps.renamePath(path, nextPath);
      const remap = (candidate: string) => candidate === path || candidate.startsWith(`${path}/`) ? `${nextPath}${candidate.slice(path.length)}` : candidate;
      setTabs((current) => current.map((tab) => ({ ...tab, path: remap(tab.path), name: basename(remap(tab.path)) })));
      if (activePath) setActivePath(remap(activePath)); if (workspaceRoot) setTree(await window.wmps.openWorkspace(workspaceRoot));
    } else if (value.startsWith('new-at:')) { const [, kind, ...parts] = value.split(':'); if (['markdown', 'word', 'spreadsheet'].includes(kind)) await newFile(kind as 'markdown' | 'word' | 'spreadsheet', parts.join(':')); }
    else if (value.startsWith('new-folder-at:')) { const directory = value.slice('new-folder-at:'.length); const name = (await requestName('New folder', 'Untitled Folder'))?.trim(); if (name && !name.includes('/') && !name.includes('\\')) { await window.wmps.createDirectory(`${directory}/${name}`); if (workspaceRoot) setTree(await window.wmps.openWorkspace(workspaceRoot)); } }
    else if (value.startsWith('open-recent:')) await openWorkspaceWindow(value.slice('open-recent:'.length));
    else if (value === 'language:en' || value === 'language:zh-CN') await i18n.changeLanguage(value.slice('language:'.length));
  }, [activePath, closeTab, chooseFiles, newFile, openWorkspaceWindow, saveTab, tabs, workspaceRoot]);

  const reorderTabs = useCallback((from: string, to: string) => setTabs((current) => {
    const fromIndex = current.findIndex((tab) => tab.path === from); const toIndex = current.findIndex((tab) => tab.path === to); if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;
    const next = [...current]; const [moved] = next.splice(fromIndex, 1); next.splice(toIndex, 0, moved); return next;
  }), []);

  const beginSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizingSidebar(true);
    const resize = (moveEvent: PointerEvent) => setSidebarWidth(Math.min(520, Math.max(190, moveEvent.clientX - 44)));
    const finish = () => { setResizingSidebar(false); window.removeEventListener('pointermove', resize); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); };
    window.addEventListener('pointermove', resize); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish);
  }, []);

  useEffect(() => {
    const restore = async () => { const session = await window.wmps.loadSession(); await i18n.changeLanguage(session.language); setSidebarVisible(session.sidebarVisible); setSidebarWidth(session.sidebarWidth); if (session.workspaceRoot) await openWorkspace(session.workspaceRoot); for (const tab of session.tabs) { try { await openFile(tab.path, { scrollTop: tab.scrollTop, zoom: tab.zoom, splitRatio: tab.splitRatio }); } catch { /* missing file */ } } if (session.activePath) setActivePath(session.activePath); setRecents(await window.wmps.getRecentWorkspaces()); restoring.current = false; }; void restore();
  }, []);
  useEffect(() => { if (restoring.current) return; const session: SessionState = { workspaceRoot, tabs: tabs.map((tab) => ({ path: tab.path, scrollTop: tab.viewState?.scrollTop ?? 0, zoom: tab.viewState?.zoom ?? 1, splitRatio: tab.viewState?.splitRatio ?? 0.5 })), activePath, sidebarVisible, sidebarWidth, language: i18n.language as 'en' | 'zh-CN' }; const timer = setTimeout(() => void window.wmps.saveSession(session), 300); return () => clearTimeout(timer); }, [workspaceRoot, tabs, activePath, sidebarVisible, sidebarWidth, i18n.language]);
  useEffect(() => window.wmps.onMenuCommand((value) => void command(value)), [command]);
  useEffect(() => window.wmps.onOpenPaths((paths) => paths.forEach((path) => void openFile(path))), [openFile]);
  useEffect(() => window.wmps.onWorkspaceChanged((change) => {
    if (change.root !== workspaceRoot) return;
    void window.wmps.openWorkspace(change.root).then(setTree);
    const tab = tabsRef.current.find((item) => item.path === change.path); if (!tab) return;
    if (tab.dirty || change.event === 'unlink') setTabs((current) => replaceTab(current, change.path, (item) => ({ ...item, externalChanged: true })));
    else void reloadFile(change.path).catch(() => setTabs((current) => replaceTab(current, change.path, (item) => ({ ...item, externalChanged: true }))));
  }), [workspaceRoot, reloadFile]);
  useEffect(() => window.wmps.onBeforeClose(() => { void (async () => {
    const dirty = tabsRef.current.filter((tab) => tab.dirty); if (!dirty.length) { window.wmps.confirmClose(); return; }
    const decision = await window.wmps.confirmUnsaved(dirty.map((tab) => tab.name), true); if (decision === 'cancel') { window.wmps.cancelClose(); return; }
    if (decision === 'save') for (const tab of dirty) if (!await saveTab(tab.path)) { window.wmps.cancelClose(); return; } window.wmps.confirmClose();
  })(); }), [saveTab]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.metaKey && /^[1-9]$/.test(event.key)) { const tab = tabs[Number(event.key) - 1]; if (tab) { event.preventDefault(); activateTab(tab.path); } } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [tabs, activateTab]);


  return <div className={`app-shell ${sidebarVisible ? '' : 'sidebar-hidden'} ${resizingSidebar ? 'resizing-sidebar' : ''}`} style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const paths = [...event.dataTransfer.files].map((file) => window.wmps.pathForDroppedFile(file)).filter(Boolean); void window.wmps.allowDroppedFiles(paths).then(() => paths.forEach((path) => void openFile(path))); }}>
    <header className="titlebar"><div className="titlebar-brand"><span className="brand-mark">W</span><span>DOCUMENT WORKSPACE</span></div><div className="window-title"><button className="workspace-title-button" onClick={() => setWorkspaceSwitcherOpen(true)}><b>WMPS</b><span>{workspaceRoot ? basename(workspaceRoot) : t('allWorkspaces')}</span><ChevronDown size={12}/></button></div><div className="title-actions"><button title="Save document (⌘S)" aria-label="Save document" disabled={!active?.dirty} onClick={() => activePath && void saveTab(activePath)}><Save size={15}/></button><button title={dark ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle theme" onClick={() => void window.wmps.setTheme(dark ? "light" : "dark")}>{dark ? <Sun size={15}/> : <Moon size={15}/>}</button><button aria-label="Toggle sidebar" title="Toggle sidebar" onClick={() => setSidebarVisible(!sidebarVisible)}>{sidebarVisible ? <PanelLeftClose size={15}/> : <PanelLeftOpen size={15}/>}</button><button aria-label="Quick open" title="Quick open (⌘P)" onClick={() => setQuickOpen(true)}><Search size={15}/></button><button aria-label="Change language" title="Change language" onClick={() => void i18n.changeLanguage(i18n.language === 'en' ? 'zh-CN' : 'en')}><Languages size={15}/></button></div></header>
    <nav className="activity-rail" aria-label="Workspace tools"><button className={sidebarVisible && !searchOpen ? 'selected' : ''} title="Explorer" aria-label="Explorer" onClick={() => { setSidebarVisible(searchOpen || !sidebarVisible); setSearchOpen(false); }}><Files size={21}/></button><button className={searchOpen && sidebarVisible ? 'selected' : ''} title="Search workspace" aria-label="Search workspace" onClick={() => { setSidebarVisible(true); workspaceRoot ? setSearchOpen(!searchOpen) : setQuickOpen(true); }}><Search size={21}/></button><button title="Open folder" aria-label="Open folder" onClick={() => void openWorkspaceWindow()}><FolderOpen size={21}/></button><div className="rail-spacer"/><button title="New Markdown document" aria-label="New Markdown document" onClick={() => void newFile('markdown')}><Plus size={21}/></button></nav>
    {sidebarVisible && <><Sidebar tree={tree} activePath={activePath} onOpen={(path) => void openFile(path)} onOpenFolder={() => void openWorkspaceWindow()} onQuickOpen={() => setQuickOpen(true)}/><div className="sidebar-resize-handle" role="separator" aria-label="Resize sidebar" aria-orientation="vertical" aria-valuemin={190} aria-valuemax={520} aria-valuenow={sidebarWidth} onPointerDown={beginSidebarResize}/></>}<TabBar tabs={tabs} activePath={activePath} onActivate={activateTab} onClose={(path) => void closeTab(path)} onReorder={reorderTabs}/>
    <main className="editor-area">{error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={15}/></button></div>}{active?.externalChanged && <div className="conflict-banner">{t('changedDisk')}<button onClick={() => void reloadFile(active.path)}>{t('reload')}</button><button onClick={() => setTabs((current) => replaceTab(current, active.path, (tab) => ({ ...tab, externalChanged: false })))}>{t('keepMine')}</button></div>}{tabs.map((tab) => <DocumentPane key={tab.path} tab={tab} visible={tab.path === activePath} markDirty={markDirty} handles={handles}/>)}{!active && <Welcome recents={recents} onFolder={() => void openWorkspaceWindow()} onFile={() => void chooseFiles()} onRecent={(path) => void openWorkspaceWindow(path)}/>}</main>
    <footer className="statusbar"><span>{active ? active.kind.toUpperCase() : t('ready')}</span><span>{active?.dirty ? 'Modified' : active ? t('saved') : 'All files stay on your device'}</span><span className="status-spacer"/><span>{active ? basename(active.path) : 'WMPS 0.1.3'}</span></footer>
    {nameDialog && <div className="overlay" onClick={() => finishName(null)}><form className="name-dialog" role="dialog" aria-modal="true" aria-labelledby="name-dialog-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') finishName(null); if (event.key === 'Tab') { event.preventDefault(); const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input,button')); const next = (elements.indexOf(document.activeElement as HTMLElement) + (event.shiftKey ? -1 : 1) + elements.length) % elements.length; elements[next]?.focus(); } }} onSubmit={(event) => { event.preventDefault(); finishName(nameDialog.value); }}><h2 id="name-dialog-title">{nameDialog.title}</h2><label htmlFor="document-name">Name</label><input id="document-name" autoFocus value={nameDialog.value} onFocus={(event) => event.target.select()} onChange={(event) => setNameDialog({ ...nameDialog, value: event.target.value })}/><footer><button type="button" onClick={() => finishName(null)}>Cancel</button><button type="submit" className="primary" disabled={!nameDialog.value.trim()}>Continue</button></footer></form></div>}
    {workspaceSwitcherOpen && <WorkspaceSwitcher recents={recents} current={workspaceRoot} onChoose={(path) => void openWorkspaceWindow(path)} onBrowse={() => void openWorkspaceWindow()} onClose={() => setWorkspaceSwitcherOpen(false)}/>}
    {quickOpen && <CommandPalette tree={tree} onClose={() => setQuickOpen(false)} onOpen={(path) => void openFile(path)}/>} {searchOpen && sidebarVisible && workspaceRoot && <SearchPanel root={workspaceRoot} onClose={() => setSearchOpen(false)} onOpen={(result, query) => { void (async () => { await openFile(result.path); for (let i = 0; i < 40; i++) { await new Promise(resolve => setTimeout(resolve, 100)); const handle = handles.current.get(result.path); if (handle) { handle.revealResult?.(query, result.line, result.location); break; } } })(); }}/>
}</div>;
}
