import { app, BrowserWindow, ipcMain, nativeTheme, protocol } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import pino from 'pino';
import { installApplicationMenu } from './menu.js';
import { registerIpc } from './ipc.js';
import { WorkspaceService } from './workspace-service.js';
import { StateStore } from './state-store.js';

protocol.registerSchemesAsPrivileged([{ scheme: 'wmps-file', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } }]);
app.setName('WMPS');
if (process.env.WMPS_USER_DATA) app.setPath('userData', process.env.WMPS_USER_DATA);

const queuedPaths: string[] = [];
const state = new StateStore();
const workspaces = new Set<WorkspaceService>();
const workspaceByWindow = new Map<number, WorkspaceService>();
const forceClose = new Set<number>();
let quitting = false;

app.on('open-file', (event, path) => {
  event.preventDefault(); const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]; const workspace = window ? workspaceByWindow.get(window.id) : null;
  if (!window || !workspace) { queuedPaths.push(path); if (app.isReady()) void createWindow(); return; }
  workspace.allowFile(path); if (window.webContents.isLoading()) queuedPaths.push(path); else window.webContents.send('app:open-paths', [path]);
});

app.on('open-url', (event) => event.preventDefault());

function refreshMenu() { installApplicationMenu(state.getRecents()); }

async function createWindow(workspaceRoot?: string) {
  const logs = app.getPath('logs'); mkdirSync(logs, { recursive: true });
  const logger = pino(pino.destination(join(logs, 'wmps.log')));
  const workspace = new WorkspaceService(); workspaces.add(workspace);
  if (process.env.WMPS_TEST_WORKSPACE && BrowserWindow.getAllWindows().length === 0) {
    const paths = (process.env.WMPS_TEST_TABS ?? '').split(',').filter(Boolean);
    await state.saveSession({ workspaceRoot: process.env.WMPS_TEST_WORKSPACE, tabs: paths.map((path) => ({ path, scrollTop: 0, zoom: 1, splitRatio: 0.5 })), activePath: paths[0] ?? null, sidebarVisible: true, sidebarWidth: 260, language: 'en' });
  }
  refreshMenu();

  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 820,
    minHeight: 560,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191b1d' : '#f4f4f3',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      additionalArguments: workspaceRoot ? [`--wmps-workspace=${encodeURIComponent(workspaceRoot)}`] : []
    }
  });
  workspaceByWindow.set(window.id, workspace);
  window.webContents.on('console-message', (details) => {
    const message = `[renderer:${details.level}] ${details.message}`;
    if (details.level === 'error') logger.error(message);
    else if (process.env.WMPS_DEBUG_RENDERER === '1') logger.info(message);
  });
  window.webContents.on('zoom-changed', (event, direction) => {
    event.preventDefault();
    window.webContents.send('menu:command', direction === 'in' ? 'zoom-in' : 'zoom-out');
  });
  registerIpc(window, workspace, state, async (root) => { await createWindow(root); }, refreshMenu);

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL);
    if (!allowed && !url.startsWith('file:')) event.preventDefault();
  });
  window.webContents.on('render-process-gone', (_event, details) => logger.error({ details }, 'renderer process exited'));
  window.on('unresponsive', () => logger.warn('window became unresponsive'));
  window.on('close', (event) => {
    if (forceClose.has(window.id)) return;
    event.preventDefault(); window.webContents.send('window:before-close', true);
  });
  window.on('closed', () => { forceClose.delete(window.id); workspaceByWindow.delete(window.id); workspaces.delete(workspace); void workspace.dispose(); if (quitting && BrowserWindow.getAllWindows().length === 0) setImmediate(() => app.quit()); });
  window.once('ready-to-show', () => window.show());
  window.webContents.once('did-finish-load', () => {
    void window.webContents.setVisualZoomLevelLimits(1, 1);
    if (queuedPaths.length) { queuedPaths.forEach((path) => workspace.allowFile(path)); window.webContents.send('app:open-paths', [...queuedPaths]); queuedPaths.length = 0; }
    if (process.env.WMPS_CAPTURE_PATH || process.env.WMPS_DOM_PATH) setTimeout(async () => {
      if (process.env.WMPS_CAPTURE_PATH) { const image = await window.webContents.capturePage(); await writeFile(process.env.WMPS_CAPTURE_PATH, image.toPNG()); }
      if (process.env.WMPS_DOM_PATH) await writeFile(process.env.WMPS_DOM_PATH, await window.webContents.executeJavaScript('document.body.outerHTML'));
    }, Number(process.env.WMPS_CAPTURE_DELAY_MS ?? 1600));
  });

  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await window.loadURL(pathToFileURL(join(import.meta.dirname, '../../dist/index.html')).toString());
}

function mimeType(path: string) {
  const extension = path.toLowerCase().split('.').pop();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', css: 'text/css', html: 'text/html', htm: 'text/html', webp: 'image/webp', woff2: 'font/woff2' } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream';
}

app.whenReady().then(async () => {
  try { const theme = readFileSync(join(app.getPath('userData'), 'appearance'), 'utf8'); if (theme === 'light' || theme === 'dark' || theme === 'system') nativeTheme.themeSource = theme; } catch { /* Follow system on first launch. */ }
  nativeTheme.on('updated', () => { writeFileSync(join(app.getPath('userData'), 'appearance'), nativeTheme.themeSource); });
  await state.loadSession();
  protocol.handle('wmps-file', async (request) => {
    const url = new URL(request.url); const path = decodeURIComponent(url.pathname);
    for (const workspace of workspaces) try { const snapshot = await workspace.read(path); return new Response(snapshot.bytes, { headers: { 'Content-Type': mimeType(path), 'Cache-Control': 'no-store' } }); } catch { /* Try the next open workspace. */ }
    return new Response('Not found', { status: 404 });
  });
  ipcMain.on('window:close-confirmed', (event) => { const window = BrowserWindow.fromWebContents(event.sender); if (!window) return; forceClose.add(window.id); window.close(); });
  ipcMain.on('window:close-cancelled', (event) => { const window = BrowserWindow.fromWebContents(event.sender); if (window) forceClose.delete(window.id); quitting = false; });
  const workspaceIndex = process.argv.indexOf('--workspace');
  await createWindow(workspaceIndex >= 0 ? process.argv[workspaceIndex + 1] : undefined);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});

app.on('before-quit', (event) => {
  const pending = BrowserWindow.getAllWindows().filter((window) => !forceClose.has(window.id));
  if (pending.length) { event.preventDefault(); quitting = true; pending.forEach((window) => window.webContents.send('window:before-close', true)); }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('quit', () => workspaces.forEach((workspace) => void workspace.dispose()));
