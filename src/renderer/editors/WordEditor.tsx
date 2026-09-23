import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DocxEditor, type DocxEditorRef } from '@docx-editor.dev/react';
import { FileText, MessageSquare, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EditorHandle, EditorProps } from './types';
import { clampZoom } from './document-zoom';
import { useDocumentPinchZoom } from '../hooks/useDocumentPinchZoom';
import '@docx-editor.dev/core/styles/editor.css';

import { wordReviewModules } from './word-review';
import { readWordComments } from './word-comments';

export default function WordEditor({ path, bytes, onDirtyChange, registerHandle, initialState }: EditorProps) {
  const ref = useRef<DocxEditorRef>(null); const rootRef = useRef<HTMLDivElement>(null); const ignoreChangesUntil = useRef(Number.POSITIVE_INFINITY); const [zoom, setZoom] = useState(initialState?.zoom ?? 1); const { i18n } = useTranslation();
  const scaleDocument = useCallback((factor: number) => {
    const editor = ref.current?.getEditor(); if (!editor) return;
    const next = clampZoom(editor.getZoom() * factor, .5, 3); editor.setZoom(next); setZoom(next);
  }, []);
  const comments = useMemo(() => readWordComments(bytes), [bytes]);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [nativeActive, setNativeActive] = useState<string | null>(null);
  const [linkedComments, setLinkedComments] = useState<Set<string>>(new Set());
  const [connector, setConnector] = useState('');
  const threads = useMemo(() => {
    const byId = new Map(comments.map(comment => [comment.id, comment]));
    const groups = new Map<string, typeof comments>();
    for (const comment of comments) { let root = comment; const visited = new Set<string>(); while (root.parentId && byId.has(root.parentId) && !visited.has(root.parentId)) { visited.add(root.id); root = byId.get(root.parentId)!; } const group = groups.get(root.id) || []; group.push(comment); groups.set(root.id, group); }
    return [...groups.entries()].map(([id, items]) => ({ root: byId.get(id)!, replies: items.filter(item => item.id !== id) }));
  }, [comments]);
  const [commentsOpen, setCommentsOpen] = useState(comments.length > 0);
  useEffect(() => {
    let lastActive: string | null = null;
    let lastLinks = '';
    let lastPane = false;
    const timer = window.setInterval(() => {
      const editor = ref.current?.getEditor(); if (!editor || !rootRef.current?.offsetParent) return;
      const pane = editor.isReviewPaneOpen();
      if (pane !== lastPane) { lastPane = pane; setCommentsOpen(pane); }
      const items = editor.getReviewItems().filter(item => item.kind === 'comment');
      const links = items.filter(item => item.activatable).map(item => item.id);
      if (links.join(',') !== lastLinks) { lastLinks = links.join(','); setLinkedComments(new Set(links)); }
      const active = items.find(item => item.isActive);
      setNativeActive(active?.id || null);
      if (active && active.id !== lastActive) {
        lastActive = active.id; setActiveComment(active.id); setCommentsOpen(true);
        window.requestAnimationFrame(() => alignComment(active.id));
      } else if (!active && lastActive) { lastActive = null; setActiveComment(null); }
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const root = rootRef.current; if (!root || !commentsOpen || !activeComment) { setConnector(''); return; }
    let frame = 0;
    const draw = () => {
      const band = root.querySelector('.docx-comment-band--active, .docx-comment-band--resolved-active');
      const card = root.querySelector('.active-comment');
      const page = root.querySelector('.docx-editor__scroll-container');
      if (band && card) {
        const a = band.getBoundingClientRect(), b = card.getBoundingClientRect(), r = root.getBoundingClientRect();
        const clip = page?.getBoundingClientRect() || r;
        if (a.bottom > clip.top && a.top < clip.bottom && b.bottom > r.top && b.top < r.bottom) {
          const x1 = a.right - r.left, y1 = Math.max(clip.top, a.top) - r.top + Math.min(a.height, 16) / 2;
          const x2 = b.left - r.left, y2 = Math.max(b.top + 22, clip.top + 8) - r.top;
          setConnector(`M ${x1} ${y1} H ${x2 - 12} V ${y2} H ${x2}`);
        } else setConnector('');
      } else setConnector('');
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [activeComment, commentsOpen]);
  useDocumentPinchZoom(rootRef, scaleDocument);
  useEffect(() => {
    const handle: EditorHandle = {
      async serialize() { const result = await ref.current?.save(); if (!result) throw new Error('The Word editor is not ready'); return new Uint8Array(result); },
      revealResult(query, _line, location) {
        if (location?.startsWith('Comment')) {
          const comment = comments.find(item => item.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
          if (comment) { setCommentsOpen(true); ref.current?.getEditor()?.setActiveReviewItem(`comment-${comment.parentId || comment.id}`); setActiveComment(comment.parentId || comment.id); window.setTimeout(() => rootRef.current?.querySelector(`[data-comment-id="${comment.id}"]`)?.scrollIntoView({ block: 'center' }), 100); }
        } else { const editor = ref.current?.getEditor(); const match = editor?.findMatches(query)[0]; if (match) editor?.selectMatch(match); }
      },
      focusSearch() { ref.current?.focus(); },
      zoomBy: scaleDocument,
      getViewState() { return { zoom: ref.current?.snapshot().zoom ?? 1 }; }
    };
    registerHandle(handle); return () => registerHandle(null);
  }, [registerHandle, scaleDocument, comments]);
  const alignComment = (id: string) => {
    const root = rootRef.current;
    const list = root?.querySelector('.comments-list');
    const card = root?.querySelector(`[data-thread-id="${CSS.escape(id)}"]`);
    const band = root?.querySelector('.docx-comment-band--active, .docx-comment-band--resolved-active');
    if (!list || !card || !band) return;
    const a = band.getBoundingClientRect(), b = card.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    const target = Math.max(bounds.top + 12, Math.min(a.top - 18, bounds.bottom - Math.min(b.height, 250)));
    list.scrollTop += b.top - target;
  };
  const activateComment = (id: string) => {
    setActiveComment(id);
    ref.current?.getEditor()?.setActiveReviewItem(`comment-${id}`, { reveal: 'centerIfNeeded' });
    requestAnimationFrame(() => alignComment(id));
  };
  const entry = (comment: typeof comments[number], reply = false) => <section className={`comment-entry ${reply ? 'comment-reply' : ''}`} data-comment-id={comment.id} key={comment.id}>
    <div className="comment-author"><span className="comment-avatar">{comment.initials || '?'}</span><div><b>{comment.author || 'Unknown author'}</b>{comment.date && <time>{Number.isNaN(Date.parse(comment.date)) ? comment.date : new Date(comment.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>}</div>{comment.resolved && <small>Resolved</small>}</div>
    <p>{comment.text}</p>
  </section>;
  return <div ref={rootRef} className={`format-editor word-editor ${commentsOpen ? 'with-comments' : ''}`} data-document-zoom={zoom.toFixed(3)}>
    <div className="word-document-bar"><span><FileText size={14}/> Word document</span><button aria-label="Show comments" aria-expanded={commentsOpen} onClick={() => setCommentsOpen(!commentsOpen)}><MessageSquare size={14}/> Comments <span className="comment-count">{comments.length}</span></button></div>
    <div className="word-engine"><DocxEditor modules={wordReviewModules} colorMode="system" ref={ref} document={bytes} title={path.split(/[\\/]/).pop()} menu={false} locale={i18n.language} mode="edit" onReady={editor => { if (initialState?.zoom && initialState.zoom !== 1) editor.setZoom(clampZoom(initialState.zoom, .5, 3)); setZoom(editor.getZoom()); ignoreChangesUntil.current = performance.now() + 750; }} onChange={() => { if (performance.now() > ignoreChangesUntil.current) onDirtyChange(true); }} onFontError={error => console.warn('DOCX font substitution', error)}/></div>
    {commentsOpen && <aside className="word-comments" aria-label="Document comments"><header><div><b>Comments</b><small>{threads.length} threads · {comments.length} comments</small></div><button aria-label="Close comments" onClick={() => setCommentsOpen(false)}><X size={15}/></button></header>
    <div className="comments-list">{comments.length === 0 ? <p className="comments-empty">No comments in this document.</p> : threads.map(({root, replies}) => <article className={`comment-card ${activeComment === root.id ? 'active-comment' : ''}`} key={root.id} data-thread-id={root.id} data-native-active={nativeActive === root.id} data-linked={linkedComments.has(root.id)} tabIndex={0} role="button" aria-label={`Comment by ${root.author}`} aria-pressed={activeComment === root.id} onClick={() => activateComment(root.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateComment(root.id); } }}>
      {!linkedComments.has(root.id) && <small className="unanchored-comment">No text anchor in this file</small>}
      {entry(root)}{replies.map(reply => entry(reply, true))}
    </article>)}</div></aside>}
    {connector && <svg className="comment-connector" aria-hidden="true"><path d={connector}/></svg>}
  </div>;
}
