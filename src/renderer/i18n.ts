import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

void i18n.use(initReactI18next).init({
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  resources: {
    en: { translation: {
      workspace: 'WORKSPACE', openFolder: 'Open Folder', openFile: 'Open File', noFolder: 'No folder open',
      welcomeTitle: 'Your documents, one workspace.', welcomeBody: 'Open a folder to work across Markdown, Word, spreadsheets, HTML and PDF without leaving your context.',
      recent: 'RECENT WORKSPACES', quickOpen: 'Quick Open', search: 'Search', saved: 'Saved', saving: 'Saving…', ready: 'Ready',
      editor: 'Editor', split: 'Split', preview: 'Preview', unsupported: 'This file type is not editable in WMPS.', reveal: 'Reveal in Finder',
      changedDisk: 'This file changed on disk.', reload: 'Reload', keepMine: 'Keep Mine', saveCopy: 'Save a Copy',
      closeUnsaved: 'Save changes before closing?', discard: 'Discard', cancel: 'Cancel', save: 'Save', close: 'Close',
      workspaceLibrary: 'WORKSPACE LIBRARY', allWorkspaces: 'All workspaces', workspaceWindowHint: 'Choose a workspace to open it in a separate WMPS window.', current: 'Current', noRecentWorkspaces: 'No previous workspaces yet.', openNewWorkspace: 'Open another workspace…'
    } },
    'zh-CN': { translation: {
      workspace: '工作区', openFolder: '打开文件夹', openFile: '打开文件', noFolder: '未打开文件夹',
      welcomeTitle: '所有文档，一个工作区。', welcomeBody: '打开文件夹，在 Markdown、Word、电子表格、HTML 和 PDF 之间自然切换。',
      recent: '最近的工作区', quickOpen: '快速打开', search: '搜索', saved: '已保存', saving: '正在保存…', ready: '就绪',
      editor: '编辑器', split: '拆分', preview: '预览', unsupported: 'WMPS 不支持编辑此文件类型。', reveal: '在访达中显示',
      changedDisk: '此文件已在磁盘上更改。', reload: '重新加载', keepMine: '保留我的版本', saveCopy: '保存副本',
      closeUnsaved: '关闭前保存更改吗？', discard: '不保存', cancel: '取消', save: '保存', close: '关闭',
      workspaceLibrary: '工作区资料库', allWorkspaces: '所有工作区', workspaceWindowHint: '选择工作区后，它将在独立的 WMPS 窗口中打开。', current: '当前', noRecentWorkspaces: '还没有历史工作区。', openNewWorkspace: '打开另一个工作区…'
    } }
  }
});

export default i18n;
