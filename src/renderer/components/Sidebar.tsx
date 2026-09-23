import { useState } from 'react';
import { ChevronDown, ChevronRight, File, FileCode2, FileSpreadsheet, FileText, Folder, FolderOpen, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TreeNode } from '../../shared/contracts';

interface Props { tree: TreeNode | null; activePath: string | null; onOpen(path: string): void; onOpenFolder(): void; onQuickOpen(): void; }

function KindIcon({ node }: { node: TreeNode }) {
  if (node.type === 'directory') return <Folder size={15}/>;
  if (['spreadsheet', 'spreadsheet-legacy', 'csv'].includes(node.kind)) return <FileSpreadsheet size={15}/>;
  if (node.kind === 'html') return <FileCode2 size={15}/>;
  if (['markdown', 'word', 'word-legacy', 'pdf'].includes(node.kind)) return <FileText size={15}/>;
  return <File size={15}/>;
}

function TreeItem({ node, depth, activePath, onOpen }: { node: TreeNode; depth: number; activePath: string | null; onOpen(path: string): void }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const directory = node.type === 'directory';
  return <div className="tree-node">
    <button data-path={node.path} data-kind={node.kind} className={`tree-row ${activePath === node.path ? 'active' : ''} ${node.kind === 'unsupported' && !directory ? 'unsupported' : ''}`} style={{ paddingLeft: 8 + depth * 16 }} onClick={() => directory ? setExpanded(!expanded) : onOpen(node.path)} onDoubleClick={() => !directory && onOpen(node.path)} onContextMenu={(event) => { event.preventDefault(); void window.wmps.showContextMenu(node.path, directory); }}>
      <span className="disclosure">{directory ? expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/> : null}</span><KindIcon node={node}/><span className="tree-label">{node.name}</span>
    </button>
    {directory && expanded && node.children?.map((child) => <TreeItem key={child.path} node={child} depth={depth + 1} activePath={activePath} onOpen={onOpen}/>)}
  </div>;
}

export function Sidebar({ tree, activePath, onOpen, onOpenFolder, onQuickOpen }: Props) {
  const { t } = useTranslation();
  return <aside className="workspace-sidebar"><div className="sidebar-heading"><span>{t('workspace')}</span><button aria-label="Open folder" onClick={onOpenFolder}><Plus size={14}/></button></div>
    <button className="quick-open-button" onClick={onQuickOpen}><Search size={13}/><span>{t('quickOpen')}</span><kbd>⌘P</kbd></button>
    <div className="file-tree">{tree ? <TreeItem node={tree} depth={0} activePath={activePath} onOpen={onOpen}/> : <div className="empty-sidebar"><FolderOpen size={23}/><span>{t('noFolder')}</span><button onClick={onOpenFolder}>{t('openFolder')}</button></div>}</div>
  </aside>;
}
