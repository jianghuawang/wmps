import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { z } from 'zod';
import {
  bytesSchema, fileSnapshotSchema, pathSchema, recoveryRecordSchema, searchResultSchema,
  sessionStateSchema, treeNodeSchema, unsavedDecisionSchema, workspaceChangeSchema, writeFileRequestSchema, type MenuCommand, type WmsApi
} from '../shared/contracts';

const voidSchema = z.void();
const pathsSchema = z.array(pathSchema);
const startupWorkspaceArgument = process.argv.find((argument) => argument.startsWith('--wmps-workspace='));
const startupWorkspace = startupWorkspaceArgument ? decodeURIComponent(startupWorkspaceArgument.slice('--wmps-workspace='.length)) : null;

async function invoke<T>(channel: string, payload: unknown, input: z.ZodType, output: z.ZodType<T>): Promise<T> {
  const safePayload = input.parse(payload);
  const result = await ipcRenderer.invoke(channel, safePayload);
  return output.parse(result);
}

function subscribe<T>(channel: string, schema: z.ZodType<T>, listener: (value: T) => void) {
  const handler = (_event: Electron.IpcRendererEvent, value: unknown) => listener(schema.parse(value));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: WmsApi = {
  platform: process.platform,
  setTheme: (theme) => invoke('theme:set', theme, z.enum(['light', 'dark', 'system']), voidSchema),
  chooseWorkspace: () => invoke('dialog:workspace', undefined, voidSchema, pathSchema.nullable()),
  openWorkspaceWindow: (root = null) => invoke('workspace:new-window', root, pathSchema.nullable(), pathSchema.nullable()),
  chooseFiles: () => invoke('dialog:files', undefined, voidSchema, pathsSchema),
  openWorkspace: (root) => invoke('workspace:open', root, pathSchema, treeNodeSchema),
  readFile: (path) => invoke('file:read', path, pathSchema, fileSnapshotSchema),
  writeFile: (request) => invoke('file:write', request, writeFileRequestSchema, fileSnapshotSchema),
  createFile: (path, bytes) => invoke('file:create', { path, bytes }, z.object({ path: pathSchema, bytes: bytesSchema }), fileSnapshotSchema),
  createDirectory: (path) => invoke('file:mkdir', path, pathSchema, voidSchema),
  renamePath: (path, nextPath) => invoke('file:rename', { path, nextPath }, z.object({ path: pathSchema, nextPath: pathSchema }), voidSchema),
  duplicatePath: (path) => invoke('file:duplicate', path, pathSchema, pathSchema),
  trashPath: (path) => invoke('file:trash', path, pathSchema, voidSchema),
  revealPath: (path) => invoke('file:reveal', path, pathSchema, voidSchema),
  copyPath: (path) => invoke('file:copy-path', path, pathSchema, voidSchema),
  searchWorkspace: (root, query) => invoke('workspace:search', { root, query }, z.object({ root: pathSchema, query: z.string().min(1).max(500) }), z.array(searchResultSchema)),
  loadSession: () => invoke('state:load', startupWorkspace, pathSchema.nullable(), sessionStateSchema),
  saveSession: (session) => invoke('state:save', session, sessionStateSchema, voidSchema),
  loadRecovery: (path) => invoke('recovery:load', path, pathSchema, recoveryRecordSchema.nullable()),
  saveRecovery: (record) => invoke('recovery:save', record, recoveryRecordSchema, voidSchema),
  deleteRecovery: (path) => invoke('recovery:delete', path, pathSchema, voidSchema),
  getRecentWorkspaces: () => invoke('state:recents', undefined, voidSchema, pathsSchema),
  showContextMenu: (path, isDirectory) => invoke('menu:context', { path, isDirectory }, z.object({ path: pathSchema, isDirectory: z.boolean() }), voidSchema),
  confirmUnsaved: (names, closingApp) => invoke('dialog:unsaved', { names, closingApp }, z.object({ names: z.array(z.string()).min(1), closingApp: z.boolean() }), unsavedDecisionSchema),
  pathForDroppedFile: (file) => webUtils.getPathForFile(file),
  allowDroppedFiles: (paths) => invoke('file:allow-dropped', paths, pathsSchema, voidSchema),
  confirmClose: () => ipcRenderer.send('window:close-confirmed'),
  cancelClose: () => ipcRenderer.send('window:close-cancelled'),
  onMenuCommand: (listener) => subscribe('menu:command', z.string(), (value) => listener(value as MenuCommand)),
  onWorkspaceChanged: (listener) => subscribe('workspace:changed', workspaceChangeSchema, listener),
  onOpenPaths: (listener) => subscribe('app:open-paths', pathsSchema, listener),
  onBeforeClose: (listener) => subscribe('window:before-close', z.literal(true), () => listener())
};

contextBridge.exposeInMainWorld('wmps', Object.freeze(api));
