import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import type { EditorHandle, EditorProps } from './types';

function directoryUrl(path: string) {
  const normalized = path.replaceAll('\\', '/');
  return `wmps-file://local${encodeURI(normalized.slice(0, normalized.lastIndexOf('/') + 1))}`;
}

function safeDocument(source: string, path: string, remote: boolean) {
  const clean = DOMPurify.sanitize(source, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style', 'link', 'meta'], ADD_ATTR: ['target'] });
  const document = new DOMParser().parseFromString(clean, 'text/html');
  document.querySelectorAll('script').forEach((node) => node.remove());
  document.querySelectorAll<HTMLElement>('*').forEach((element) => [...element.attributes].forEach((attribute) => { if (attribute.name.startsWith('on')) element.removeAttribute(attribute.name); }));
  const base = document.createElement('base'); base.href = directoryUrl(path); document.head.prepend(base);
  const csp = document.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy';
  csp.content = `default-src 'none'; img-src data: blob: wmps-file:${remote ? ' https:' : ''}; style-src 'unsafe-inline' wmps-file:${remote ? ' https:' : ''}; font-src data: wmps-file:${remote ? ' https:' : ''}; media-src wmps-file:${remote ? ' https:' : ''}; script-src 'none'; connect-src 'none'; form-action 'none'`;
  document.head.prepend(csp);
  return '<!doctype html>\n' + document.documentElement.outerHTML;
}

export default function HtmlViewer({ path, bytes, registerHandle }: EditorProps) {
  const source = useMemo(() => new TextDecoder().decode(bytes), [bytes]);
  const [remote, setRemote] = useState(false); const [revision, setRevision] = useState(0); const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => safeDocument(source, path, remote), [source, path, remote, revision]);
  useEffect(() => { const handle: EditorHandle = { serialize: async () => bytes, focusSearch: () => iframeRef.current?.focus(), getViewState: () => ({ zoom: 1 }) }; registerHandle(handle); return () => registerHandle(null); }, [bytes, registerHandle]);
  return <div className="format-editor html-viewer"><div className="context-toolbar"><span className="read-only-badge"><ShieldCheck size={14}/> HTML Preview · Scripts blocked</span><span className="toolbar-spacer"/><button onClick={() => setRevision((value) => value + 1)}><RefreshCw size={14}/> Refresh</button><button className={remote ? 'active-tool' : ''} onClick={() => setRemote(!remote)}><ExternalLink size={14}/>{remote ? 'Remote content allowed' : 'Load remote content'}</button></div><div className="html-canvas"><iframe ref={iframeRef} title={`Preview of ${path}`} sandbox="" srcDoc={html}/></div></div>;
}
