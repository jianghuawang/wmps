import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, PanelLeft, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { GlobalWorkerOptions, TextLayer, getDocument, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist';
import type { EditorHandle, EditorProps } from './types';
import { clampZoom } from './document-zoom';
import { useDocumentPinchZoom } from '../hooks/useDocumentPinchZoom';
import 'pdfjs-dist/web/pdf_viewer.css';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

function Page({ document, pageNumber, scale, query, onVisible, thumbnail = false }: { document: PDFDocumentProxy; pageNumber: number; scale: number; query: string; onVisible?(page: number): void; thumbnail?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); const textRef = useRef<HTMLDivElement>(null); const [page, setPage] = useState<PDFPageProxy | null>(null); const [visible, setVisible] = useState(thumbnail);
  useEffect(() => { let live = true; void document.getPage(pageNumber).then((value) => live && setPage(value)); return () => { live = false; }; }, [document, pageNumber]);
  useEffect(() => { if (thumbnail || !rootRef.current) return; const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); onVisible?.(pageNumber); } }, { rootMargin: '700px 0px' }); observer.observe(rootRef.current); return () => observer.disconnect(); }, [thumbnail, onVisible, pageNumber]);
  useEffect(() => {
    if (!page || !visible || !canvasRef.current) return; let task: RenderTask | undefined; let cancelled = false;
    const render = async () => {
      const factor = thumbnail ? 0.18 : scale; const viewport = page.getViewport({ scale: factor }); const output = window.devicePixelRatio || 1; const canvas = canvasRef.current!; const context = canvas.getContext('2d')!;
      canvas.width = Math.floor(viewport.width * output); canvas.height = Math.floor(viewport.height * output); canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      task = page.render({ canvasContext: context, viewport, transform: output === 1 ? undefined : [output, 0, 0, output, 0, 0], canvas }); await task.promise;
      if (!thumbnail && textRef.current && !cancelled) { textRef.current.replaceChildren(); textRef.current.style.setProperty('--scale-factor', String(factor)); const layer = new TextLayer({ textContentSource: await page.getTextContent(), container: textRef.current, viewport }); await layer.render(); if (query) textRef.current.querySelectorAll('span').forEach((span) => { if (span.textContent?.toLocaleLowerCase().includes(query.toLocaleLowerCase())) span.classList.add('pdf-search-hit'); }); }
    }; void render(); return () => { cancelled = true; task?.cancel(); };
  }, [page, visible, scale, query, thumbnail]);
  const viewport = page?.getViewport({ scale: thumbnail ? .18 : scale });
  return <div ref={rootRef} className={thumbnail ? 'pdf-thumb' : 'pdf-page'} data-page={pageNumber} style={{ width: viewport?.width, minHeight: viewport?.height ?? (thumbnail ? 140 : 900) }}><canvas ref={canvasRef}/>{!thumbnail && <div ref={textRef} className="textLayer"/>}</div>;
}

export default function PdfViewer({ bytes, registerHandle, initialState }: EditorProps) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null); const [scale, setScale] = useState(initialState?.zoom ?? 1); const [page, setPage] = useState(1); const [thumbs, setThumbs] = useState(true); const [query, setQuery] = useState(''); const rootRef = useRef<HTMLDivElement>(null); const scrollRef = useRef<HTMLDivElement>(null); const searchRef = useRef<HTMLInputElement>(null);
  const scaleDocument = useCallback((factor: number) => setScale((value) => clampZoom(value * factor, .4, 3)), []);
  useDocumentPinchZoom(rootRef, scaleDocument);
  useEffect(() => { const task = getDocument({ data: bytes.slice() }); void task.promise.then(setDocument); return () => { void task.destroy(); }; }, [bytes]);
  useEffect(() => { const handle: EditorHandle = { serialize: async () => bytes, focusSearch: () => searchRef.current?.focus(), zoomBy: scaleDocument, getViewState: () => ({ scrollTop: scrollRef.current?.scrollTop ?? 0, zoom: scale }) }; registerHandle(handle); return () => registerHandle(null); }, [bytes, registerHandle, scale, scaleDocument]);
  const jump = (target: number) => { const next = Math.max(1, Math.min(document?.numPages ?? 1, target)); scrollRef.current?.querySelector<HTMLElement>(`[data-page="${next}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setPage(next); };
  return <div ref={rootRef} className="format-editor pdf-viewer" data-document-zoom={scale.toFixed(3)}><div className="context-toolbar"><button className={thumbs ? 'active-tool' : ''} onClick={() => setThumbs(!thumbs)}><PanelLeft size={14}/></button><button onClick={() => setScale((value) => Math.max(.4, value - .1))}><ZoomOut size={14}/></button><span className="zoom-label">{Math.round(scale * 100)}%</span><button onClick={() => setScale((value) => Math.min(3, value + .1))}><ZoomIn size={14}/></button><button onClick={() => setScale(.95)}>Fit width</button><span className="toolbar-spacer"/><div className="pdf-search"><Search size={13}/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find in PDF"/></div><button onClick={() => jump(page - 1)}><ChevronUp size={14}/></button><span>Page {page} of {document?.numPages ?? '—'}</span><button onClick={() => jump(page + 1)}><ChevronDown size={14}/></button></div>
  <div className={`pdf-body ${thumbs ? 'with-thumbs' : ''}`}>{thumbs && <aside className="pdf-thumbnails">{document && Array.from({ length: document.numPages }, (_, index) => <button key={index} className={page === index + 1 ? 'active' : ''} onClick={() => jump(index + 1)}><Page document={document} pageNumber={index + 1} scale={1} query="" thumbnail/><span>{index + 1}</span></button>)}</aside>}<div ref={scrollRef} className="pdf-scroll">{document ? Array.from({ length: document.numPages }, (_, index) => <Page key={index} document={document} pageNumber={index + 1} scale={scale} query={query} onVisible={setPage}/>) : <div className="engine-loading">Opening PDF…</div>}</div></div></div>;
}
