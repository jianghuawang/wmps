import { useEffect, useMemo, useRef, useState } from 'react';
import { FileCode2, FileSpreadsheet, FileText, Search, X } from 'lucide-react';
import type { TreeNode } from '../../shared/contracts';

function files(node: TreeNode | null): TreeNode[] { return node ? node.type === 'file' ? [node] : (node.children ?? []).flatMap(files) : []; }

export function CommandPalette({ tree, onClose, onOpen }: { tree: TreeNode | null; onClose(): void; onOpen(path: string): void }) {
  const [query, setQuery] = useState(''); const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const results = useMemo(() => files(tree).filter((file) => file.kind !== 'unsupported' && file.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 50), [tree, query]);
  return <div className="overlay" onMouseDown={onClose}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Search size={16}/><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a file name…" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); if (event.key === 'Enter' && results[0]) onOpen(results[0].path); }}/><button onClick={onClose}><X size={15}/></button></div><div className="command-results">{results.map((file, index) => <button key={file.path} className={index === 0 ? 'selected' : ''} onClick={() => onOpen(file.path)}>{['spreadsheet','spreadsheet-legacy','csv'].includes(file.kind) ? <FileSpreadsheet size={15}/> : file.kind === 'html' ? <FileCode2 size={15}/> : <FileText size={15}/>}<span><b>{file.name}</b><small>{file.path}</small></span></button>)}</div></section></div>;
}
