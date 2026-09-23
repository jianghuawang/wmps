import { useEffect, useState } from 'react';
import { Search, X, FileText } from 'lucide-react';
import type { SearchResult } from '../../shared/contracts';

export function SearchPanel({ root, onClose, onOpen }: { root: string; onClose(): void; onOpen(result: SearchResult, query: string): void }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<SearchResult[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    let current = true; setResults([]); setError(''); setBusy(Boolean(query.trim()));
    const timer = window.setTimeout(async () => {
      if (!query.trim()) return;
      try { const found = await window.wmps.searchWorkspace(root, query.trim()); if (current) setResults(found); }
      catch (reason) { if (current) setError((reason as Error).message); }
      finally { if (current) setBusy(false); }
    }, 220);
    return () => { current = false; clearTimeout(timer); };
  }, [root, query]);
  return <aside className="search-panel" aria-label="Workspace search" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <header><span>SEARCH</span><button aria-label="Close search" title="Close search (Esc)" onClick={onClose}><X size={15}/></button></header>
    <label className="workspace-search-input"><Search size={15}/><input aria-label="Search document contents" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search in folder…"/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={13}/></button>}</label>
    <div className="search-scope">{root.split(/[\\/]/).pop()}<small>File names, document text & comments</small></div>
    <div className="search-summary" role="status">{error || (busy ? 'Searching…' : query.trim() ? `${results.length} matches` : 'Find something in your documents.')}</div>
    <div className="search-results">{!busy && query.trim() && !results.length && !error && <p className="search-empty">No matches found.<br/><span>Try another word or phrase.</span></p>}{results.map(result => <button key={`${result.path}:${result.line}:${result.column}`} onClick={() => onOpen(result, query)}><b><FileText size={14}/>{result.path.split('/').pop()}<small>{result.location || `Line ${result.line}`}</small></b><span>{result.preview}</span></button>)}</div>
  </aside>;
}
