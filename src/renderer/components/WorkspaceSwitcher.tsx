import { Check, FolderOpen, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { basename } from '../utils/path';

export function WorkspaceSwitcher({ recents, current, onChoose, onBrowse, onClose }: { recents: string[]; current: string | null; onChoose(path: string): void; onBrowse(): void; onClose(): void }) {
  const { t } = useTranslation();
  return <div className="workspace-switcher-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workspace-switcher" role="dialog" aria-modal="true" aria-labelledby="workspace-switcher-title">
      <header><div><span>{t('workspaceLibrary')}</span><h2 id="workspace-switcher-title">{t('allWorkspaces')}</h2></div><button onClick={onClose} aria-label={t('close')}><X size={16}/></button></header>
      <p>{t('workspaceWindowHint')}</p>
      <div className="workspace-list">{recents.length ? recents.map((path) => {
        const active = path === current;
        return <button key={path} className={active ? 'current' : ''} onClick={() => active ? onClose() : onChoose(path)}><span className="workspace-glyph"><FolderOpen size={17}/></span><span className="workspace-copy"><b>{basename(path)}</b><small>{path}</small></span>{active && <span className="current-workspace"><Check size={12}/>{t('current')}</span>}</button>;
      }) : <div className="workspace-empty">{t('noRecentWorkspaces')}</div>}</div>
      <footer><button onClick={onBrowse}><Plus size={15}/>{t('openNewWorkspace')}</button></footer>
    </section>
  </div>;
}
