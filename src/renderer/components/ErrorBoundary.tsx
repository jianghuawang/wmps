import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Binary, FolderOpen } from 'lucide-react';

interface Props { children: ReactNode; path: string; }
interface State { error: Error | null; fallback: string | null; }

export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null, fallback: null };
  static getDerivedStateFromError(error: Error): State { return { error, fallback: null }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Editor failed', { error, info, path: this.props.path }); }
  componentDidUpdate(previous: Props) { if (previous.path !== this.props.path && this.state.error) this.setState({ error: null, fallback: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.state.fallback) return <div className="hex-fallback"><header><Binary size={16}/> Read-only fallback · {this.props.path}<button onClick={() => this.setState({ fallback: null })}>Close</button></header><pre>{this.state.fallback}</pre></div>;
    return <div className="editor-error"><AlertTriangle size={28}/><h2>This document could not be opened</h2><p>{this.state.error.message}</p><div><button onClick={() => void window.wmps.readFile(this.props.path).then(({ bytes }) => { const sample = bytes.slice(0, 32_768); const printable = [...sample].filter((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127)).length / Math.max(1, sample.length); this.setState({ fallback: printable > .8 ? new TextDecoder().decode(sample) : [...sample].map((byte, index) => `${index % 16 === 0 ? `\n${index.toString(16).padStart(8, '0')}  ` : ''}${byte.toString(16).padStart(2, '0')} `).join('').trim() }); })}><Binary size={14}/> Open read-only text/hex</button><button onClick={() => window.wmps.revealPath(this.props.path)}><FolderOpen size={14}/> Reveal in Finder</button></div></div>;
  }
}
