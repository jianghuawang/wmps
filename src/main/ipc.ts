import { BrowserWindow, Menu, dialog, nativeTheme, ipcMain, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron';
import { z } from 'zod';
import { bytesSchema, pathSchema, recoveryRecordSchema, searchRequestSchema, sessionStateSchema, writeFileRequestSchema } from '../shared/contracts.js';
import { WorkspaceService } from './workspace-service.js';
import { StateStore } from './state-store.js';

interface WindowContext { window: BrowserWindow; workspace: WorkspaceService; }
const contexts = new Map<number, WindowContext>();
let registered = false;

function contextFor(event: IpcMainInvokeEvent) {
  const context = contexts.get(event.sender.id); if (!context) throw new Error('Window context is unavailable'); return context;
}

function handle<T>(channel: string, schema: z.ZodType<T>, action: (payload: T, context: WindowContext) => unknown | Promise<unknown>) {
  ipcMain.handle(channel, (event, payload) => action(schema.parse(payload), contextFor(event)));
}

export function registerIpc(window: BrowserWindow, workspace: WorkspaceService, state: StateStore, openWorkspaceWindow: (root: string) => Promise<void>, refreshMenu: () => void) {
  const webContentsId = window.webContents.id; contexts.set(webContentsId, { window, workspace }); window.on('closed', () => contexts.delete(webContentsId));
  if (registered) return; registered = true;
  handle('theme:set', z.enum(['light', 'dark', 'system']), (theme) => { nativeTheme.themeSource = theme; refreshMenu(); });
  handle('dialog:workspace', z.void(), async (_payload, context) => {
    const result = await dialog.showOpenDialog(context.window, { properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('dialog:files', z.void(), async (_payload, context) => {
    const result = await dialog.showOpenDialog(context.window, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'WMPS Documents', extensions: ['md', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'html', 'htm', 'pdf'] }] });
    result.filePaths.forEach((path) => context.workspace.allowFile(path)); return result.canceled ? [] : result.filePaths;
  });
  handle('dialog:unsaved', z.object({ names: z.array(z.string()).min(1).max(100), closingApp: z.boolean() }), async ({ names, closingApp }, context) => {
    const multiple = names.length > 1;
    const result = await dialog.showMessageBox(context.window, {
      type: 'warning',
      buttons: [multiple ? 'Save All' : 'Save', multiple ? 'Discard All' : 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      message: closingApp ? 'Do you want to save your changes before closing WMPS?' : `Do you want to save the changes to “${names[0]}”?`,
      detail: multiple ? `${names.length} documents have unsaved changes.` : 'Your changes will be lost if you discard them.'
    });
    return (['save', 'discard', 'cancel'] as const)[result.response];
  });
  handle('workspace:open', pathSchema, async (root, context) => { await state.rememberWorkspace(root); refreshMenu(); return context.workspace.openWorkspace(root, context.window); });
  handle('workspace:new-window', pathSchema.nullable(), async (root, context) => {
    let target = root; if (!target) { const result = await dialog.showOpenDialog(context.window, { properties: ['openDirectory', 'createDirectory'] }); target = result.canceled ? null : result.filePaths[0]; }
    if (!target) return null; await state.rememberWorkspace(target); refreshMenu(); await openWorkspaceWindow(target); return target;
  });
  handle('file:read', pathSchema, (path, context) => context.workspace.read(path));
  handle('file:allow-dropped', z.array(pathSchema).max(100), (paths, context) => { paths.forEach((path) => context.workspace.allowFile(path)); });
  handle('file:write', writeFileRequestSchema, ({ path, bytes, expectedMtimeMs }, context) => context.workspace.write(path, bytes, expectedMtimeMs));
  handle('file:create', z.object({ path: pathSchema, bytes: bytesSchema }), ({ path, bytes }, context) => context.workspace.create(path, bytes));
  handle('file:mkdir', pathSchema, (path, context) => context.workspace.createDirectory(path));
  handle('file:rename', z.object({ path: pathSchema, nextPath: pathSchema }), ({ path, nextPath }, context) => context.workspace.rename(path, nextPath));
  handle('file:duplicate', pathSchema, (path, context) => context.workspace.duplicate(path));
  handle('file:trash', pathSchema, (path, context) => context.workspace.trash(path));
  handle('file:reveal', pathSchema, (path, context) => context.workspace.reveal(path));
  handle('file:copy-path', pathSchema, (path, context) => context.workspace.copyPath(path));
  handle('workspace:search', searchRequestSchema, ({ root, query }, context) => context.workspace.search(root, query));
  handle('state:load', pathSchema.nullable(), (root) => state.loadSession(root));
  handle('state:save', sessionStateSchema, (session) => state.saveSession(session));
  handle('state:recents', z.void(), () => state.getRecents());
  handle('recovery:load', pathSchema, (path) => state.loadRecovery(path));
  handle('recovery:save', recoveryRecordSchema, (record) => state.saveRecovery(record));
  handle('recovery:delete', pathSchema, (path) => state.deleteRecovery(path));
  handle('menu:context', z.object({ path: pathSchema, isDirectory: z.boolean() }), ({ path, isDirectory }, context) => {
    const items: MenuItemConstructorOptions[] = isDirectory ? [
      { label: 'New File', submenu: [
        { label: 'Markdown', click: () => context.window.webContents.send('menu:command', `new-at:markdown:${path}`) },
        { label: 'Word Document', click: () => context.window.webContents.send('menu:command', `new-at:word:${path}`) },
        { label: 'Spreadsheet', click: () => context.window.webContents.send('menu:command', `new-at:spreadsheet:${path}`) }
      ] },
      { label: 'New Folder', click: () => context.window.webContents.send('menu:command', `new-folder-at:${path}`) }, { type: 'separator' }
    ] : [];
    items.push({ label: 'Rename', click: () => context.window.webContents.send('menu:command', `rename:${path}`) }, { label: 'Duplicate', click: () => void context.workspace.duplicate(path) }, { label: 'Move to Trash', click: () => void context.workspace.trash(path) }, { type: 'separator' }, { label: 'Reveal in Finder', click: () => void context.workspace.reveal(path) }, { label: 'Copy Path', click: () => void context.workspace.copyPath(path) });
    Menu.buildFromTemplate(items).popup({ window: context.window });
  });
}
