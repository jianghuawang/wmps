import { BrowserWindow, Menu, app, nativeTheme, type MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '../shared/contracts.js';

function send(command: MenuCommand) { BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', command); }

export function installApplicationMenu(recents: string[] = []) {
  const template: MenuItemConstructorOptions[] = [
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [
      { label: 'New File', accelerator: 'CmdOrCtrl+N', submenu: [
        { label: 'Markdown', click: () => send('new-markdown') }, { label: 'Word Document', click: () => send('new-word') }, { label: 'Spreadsheet', click: () => send('new-spreadsheet') }
      ] },
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open-file') },
      { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('open-folder') },
      { label: 'Open Recent', submenu: recents.length ? recents.slice(0, 10).map((path) => ({ label: path, click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', `open-recent:${path}`) })) : [{ label: 'No Recent Workspaces', enabled: false }] },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
      { label: 'Save All', accelerator: 'CmdOrCtrl+Alt+S', click: () => send('save-all') },
      { type: 'separator' }, { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => send('close-tab') }
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' }, { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => send('find') }] },
    { label: 'View', submenu: [
      { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => send('toggle-sidebar') },
      { label: 'Toggle Preview', accelerator: 'CmdOrCtrl+Alt+P', click: () => send('toggle-preview') },
      { type: 'separator' }, { label: 'Quick Open', accelerator: 'CmdOrCtrl+P', click: () => send('quick-open') },
      { label: 'Search Workspace', accelerator: 'CmdOrCtrl+Shift+F', click: () => send('workspace-search') },
      { label: 'Appearance', submenu: [
        { label: 'System', type: 'radio', checked: nativeTheme.themeSource === 'system', click: () => { nativeTheme.themeSource = 'system'; } },
        { label: 'Light', type: 'radio', checked: nativeTheme.themeSource === 'light', click: () => { nativeTheme.themeSource = 'light'; } },
        { label: 'Dark', type: 'radio', checked: nativeTheme.themeSource === 'dark', click: () => { nativeTheme.themeSource = 'dark'; } }
      ] },
      { label: 'Language', submenu: [{ label: 'English', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', 'language:en') }, { label: '简体中文', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', 'language:zh-CN') }] },
      { type: 'separator' }, { role: 'togglefullscreen' }
    ] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
    { label: 'Help', submenu: [{ label: 'Open Logs', click: () => shellOpenLogs() }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function shellOpenLogs() { import('electron').then(({ shell }) => shell.openPath(app.getPath('logs'))); }
