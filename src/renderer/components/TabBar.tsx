import { FileCode2, FileSpreadsheet, FileText, X } from 'lucide-react';
import type { FileKind } from '../../shared/file-types';

export interface TabSummary { path: string; name: string; kind: FileKind; dirty: boolean; }
interface Props { tabs: TabSummary[]; activePath: string | null; onActivate(path: string): void; onClose(path: string): void; onReorder(from: string, to: string): void; }

function Icon({ kind }: { kind: FileKind }) {
  if (['spreadsheet', 'spreadsheet-legacy', 'csv'].includes(kind)) return <FileSpreadsheet size={14}/>;
  if (kind === 'html') return <FileCode2 size={14}/>;
  return <FileText size={14}/>;
}

export function TabBar({ tabs, activePath, onActivate, onClose, onReorder }: Props) {
  return <nav className="tabbar">{tabs.map((tab) => <button key={tab.path} draggable data-kind={tab.kind} className={`document-tab ${activePath === tab.path ? 'active' : ''}`} onClick={() => onActivate(tab.path)} onAuxClick={(event) => { if (event.button === 1) onClose(tab.path); }} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-wmps-tab', tab.path); }} onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-wmps-tab')) event.preventDefault(); }} onDrop={(event) => { const from = event.dataTransfer.getData('application/x-wmps-tab'); if (from) { event.preventDefault(); onReorder(from, tab.path); } }}>
    <Icon kind={tab.kind}/><span>{tab.name}</span>{tab.dirty && <i className="dirty-dot"/>}<span className="tab-close" role="button" tabIndex={0} aria-label={`Close ${tab.name}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); event.preventDefault(); onClose(tab.path); } }} onClick={(event) => { event.stopPropagation(); onClose(tab.path); }}><X size={13}/></span></button>)}</nav>;
}
