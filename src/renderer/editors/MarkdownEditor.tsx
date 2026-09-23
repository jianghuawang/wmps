import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { insertNewlineContinueMarkup, markdown } from '@codemirror/lang-markdown';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import { Bold, CheckSquare, Code2, Eye, Heading1, Italic, List, PanelLeftClose, Rows3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createScrollLineMap } from './markdown/line-map';
import type { EditorHandle, EditorProps } from './types';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

type Mode = 'editor' | 'split' | 'preview';

function wrapSelection(view: EditorView, before: string, after = before) {
  const ranges = view.state.selection.ranges;
  view.dispatch(view.state.changeByRange((range) => ({
    changes: [{ from: range.from, insert: before }, { from: range.to, insert: after }],
    range: EditorSelection.range(range.from + before.length, range.to + before.length)
  })));
  view.focus(); return true;
}

function renderer() {
  return new MarkdownIt({ html: true, linkify: true, typographer: true, highlight(code, language) {
    if (language && hljs.getLanguage(language)) return hljs.highlight(code, { language }).value;
    return hljs.highlightAuto(code).value;
  }}).use(taskLists, { enabled: true, label: true }).use(texmath, { engine: katex, delimiters: 'dollars' });
}

export default function MarkdownEditor({ path, bytes, onDirtyChange, registerHandle, initialState }: EditorProps) {
  const { t } = useTranslation();
  const surfacesRef = useRef<HTMLDivElement>(null); const hostRef = useRef<HTMLDivElement>(null); const previewRef = useRef<HTMLDivElement>(null); const viewRef = useRef<EditorView | null>(null);
  const scrollOwner = useRef<'source' | 'preview' | null>(null); const source = useMemo(() => new TextDecoder().decode(bytes), [bytes]); const lineNumberCompartment = useMemo(() => new Compartment(), []);
  const [mode, setMode] = useState<Mode>('split'); const [html, setHtml] = useState(''); const [showLineNumbers, setShowLineNumbers] = useState(true); const [splitRatio, setSplitRatio] = useState(initialState?.splitRatio ?? 0.5); const [resizingSplit, setResizingSplit] = useState(false);
  const md = useMemo(renderer, []);

  const markScrollOwner = (owner: 'source' | 'preview') => { scrollOwner.current = owner; };

  const renderPreview = (text: string) => {
    const previewSource = text.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, (frontmatter) => '\n'.repeat(frontmatter.split('\n').length - 1));
    const tokens = md.parse(previewSource, {});
    for (const token of tokens) if (token.map) token.attrSet('data-source-line', String(token.map[0]));
    const sanitized = DOMPurify.sanitize(md.renderer.render(tokens, md.options, {}), { ADD_ATTR: ['data-source-line', 'checked'], ADD_TAGS: ['input'] });
    const document = new DOMParser().parseFromString(`<body>${sanitized}</body>`, 'text/html'); const directory = path.replaceAll('\\', '/').slice(0, path.replaceAll('\\', '/').lastIndexOf('/') + 1);
    document.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => { const src = image.getAttribute('src') ?? ''; if (!/^(?:[a-z]+:|\/\/|#)/i.test(src)) image.src = new URL(src, `wmps-file://local${encodeURI(directory)}`).href; });
    setHtml(document.body.innerHTML);
  };

  useEffect(() => {
    if (!hostRef.current) return;
    renderPreview(source);
    const state = EditorState.create({ doc: source, extensions: [
      lineNumberCompartment.of(lineNumbers()), EditorState.readOnly.of(false), EditorView.editable.of(true), highlightActiveLine(), drawSelection(), history(), search(), markdown(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap,
        { key: 'Enter', run: insertNewlineContinueMarkup }, { key: 'Mod-b', run: (view) => wrapSelection(view, '**') }, { key: 'Mod-i', run: (view) => wrapSelection(view, '_') },
        { key: 'Mod-Alt-1', run: () => { setMode('editor'); return true; } }, { key: 'Mod-Alt-2', run: () => { setMode('split'); return true; } }, { key: 'Mod-Alt-3', run: () => { setMode('preview'); return true; } }]),
      EditorView.lineWrapping, EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': 'Markdown editor' }),
      EditorView.updateListener.of((update) => { if (update.docChanged) { onDirtyChange(true); renderPreview(update.state.doc.toString()); } }),
      EditorView.theme({ '&': { height: '100%', backgroundColor: 'transparent' }, '.cm-content': { padding: '32px 30px 80px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px', lineHeight: '1.75' }, '.cm-gutters': { background: 'transparent', border: 'none', color: 'var(--line-number)' }, '.cm-activeLine,.cm-activeLineGutter': { backgroundColor: 'var(--active-line)' }, '.cm-scroller': { overflow: 'auto' } })
    ] });
    const view = new EditorView({ state, parent: hostRef.current }); viewRef.current = view;
    if (initialState?.scrollTop) view.scrollDOM.scrollTop = initialState.scrollTop;
    const onSourceScroll = () => {
      if (scrollOwner.current !== 'source' || !previewRef.current) return;
      markScrollOwner('source');
      const anchors = [...previewRef.current.querySelectorAll<HTMLElement>('[data-source-line]')].map((element) => ({ sourceLine: Number(element.dataset.sourceLine), previewTop: element.offsetTop }));
      if (!anchors.length) return;
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop); const line = view.state.doc.lineAt(block.from).number - 1;
      previewRef.current.scrollTop = createScrollLineMap(anchors).previewTopForLine(line);
    };
    const onSourceWheel = () => markScrollOwner('source');
    view.scrollDOM.addEventListener('scroll', onSourceScroll, { passive: true });
    view.scrollDOM.addEventListener('wheel', onSourceWheel, { passive: true });
    return () => { view.scrollDOM.removeEventListener('scroll', onSourceScroll); view.scrollDOM.removeEventListener('wheel', onSourceWheel); view.destroy(); viewRef.current = null; };
  }, [source, lineNumberCompartment]);

  useEffect(() => {
    const handle: EditorHandle = { revealResult(query, line) { const view = viewRef.current; if (!view) return; const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines)); const index = Math.max(0, target.text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())); view.dispatch({ selection: { anchor: target.from + index, head: Math.min(target.to, target.from + index + query.length) }, scrollIntoView: true }); view.focus(); }, serialize: async () => new TextEncoder().encode(viewRef.current?.state.doc.toString() ?? source), focusSearch: () => { if (viewRef.current) openSearchPanel(viewRef.current); }, getViewState: () => ({ scrollTop: viewRef.current?.scrollDOM.scrollTop ?? 0, zoom: 1, splitRatio }) };
    registerHandle(handle); return () => registerHandle(null);
  }, [registerHandle, source, splitRatio]);

  const command = (kind: string) => { const view = viewRef.current; if (!view) return; if (kind === 'bold') wrapSelection(view, '**'); else if (kind === 'italic') wrapSelection(view, '_'); else { const selection = view.state.selection.main; const prefix = kind === 'heading' ? '# ' : kind === 'task' ? '- [ ] ' : '- '; view.dispatch({ changes: { from: view.state.doc.lineAt(selection.from).from, insert: prefix } }); view.focus(); } };
  const onPreviewScroll = () => {
    const preview = previewRef.current; const view = viewRef.current; if (!preview || !view || scrollOwner.current !== 'preview') return;
    markScrollOwner('preview');
    const anchors = [...preview.querySelectorAll<HTMLElement>('[data-source-line]')].map((element) => ({ sourceLine: Number(element.dataset.sourceLine), previewTop: element.offsetTop }));
    if (!anchors.length) return; const line = Math.round(createScrollLineMap(anchors).sourceLineForPreviewTop(preview.scrollTop));
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(Math.min(view.state.doc.lines, line + 1)).from, { y: 'start' }) });
  };
  const onPreviewWheel = (_event: ReactWheelEvent) => markScrollOwner('preview');
  const beginSplitResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!surfacesRef.current) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizingSplit(true);
    const resize = (moveEvent: PointerEvent) => { const rect = surfacesRef.current?.getBoundingClientRect(); if (!rect) return; setSplitRatio(Math.min(0.75, Math.max(0.25, (moveEvent.clientX - rect.left) / rect.width))); };
    const finish = () => { setResizingSplit(false); window.removeEventListener('pointermove', resize); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); };
    window.addEventListener('pointermove', resize); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish);
  };
  const toggleTask = (event: React.MouseEvent) => {
    const target = event.target as HTMLInputElement; if (target.type !== 'checkbox' || !viewRef.current) return;
    const anchor = target.closest<HTMLElement>('[data-source-line]'); const lineNumber = Number(anchor?.dataset.sourceLine ?? -1) + 1; if (lineNumber < 1) return;
    const line = viewRef.current.state.doc.line(lineNumber); const match = line.text.match(/\[[ xX]\]/); if (!match || match.index === undefined) return;
    viewRef.current.dispatch({ changes: { from: line.from + match.index + 1, to: line.from + match.index + 2, insert: target.checked ? 'x' : ' ' } });
  };

  return <div className={`format-editor markdown-editor mode-${mode} ${resizingSplit ? 'resizing-split' : ''}`} style={{ '--markdown-split': `${splitRatio * 100}%` } as CSSProperties}><div className="context-toolbar">
    <button onClick={() => command('bold')} title="Bold"><Bold size={15}/></button><button onClick={() => command('italic')} title="Italic"><Italic size={15}/></button><span className="toolbar-separator"/><button onClick={() => command('heading')}><Heading1 size={15}/></button><button onClick={() => command('list')}><List size={15}/></button><button onClick={() => command('task')}><CheckSquare size={15}/></button><button className={showLineNumbers ? 'active-tool' : ''} title="Toggle line numbers" onClick={() => { const next = !showLineNumbers; setShowLineNumbers(next); viewRef.current?.dispatch({ effects: lineNumberCompartment.reconfigure(next ? lineNumbers() : []) }); }}><PanelLeftClose size={15}/></button><span className="toolbar-spacer"/>
    <div className="segmented"><button className={mode === 'editor' ? 'on' : ''} onClick={() => setMode('editor')}><Code2 size={13}/>{t('editor')}</button><button className={mode === 'split' ? 'on' : ''} onClick={() => setMode('split')}><Rows3 size={13}/>{t('split')}</button><button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}><Eye size={13}/>{t('preview')}</button></div>
  </div><div className="markdown-surfaces" ref={surfacesRef}><div className="markdown-source" ref={hostRef} onPointerDownCapture={() => markScrollOwner('source')} onKeyDownCapture={() => markScrollOwner('source')}/><div className="markdown-split-handle" role="separator" aria-label="Resize Markdown panels" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(splitRatio * 100)} tabIndex={mode === 'split' ? 0 : -1} onPointerDown={beginSplitResize} onDoubleClick={() => setSplitRatio(0.5)} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setSplitRatio((value) => Math.max(0.25, value - 0.02)); else if (event.key === 'ArrowRight') setSplitRatio((value) => Math.min(0.75, value + 0.02)); else return; event.preventDefault(); }}/><div className="markdown-preview-shell"><article className="markdown-preview" ref={previewRef} tabIndex={0} onPointerDownCapture={() => markScrollOwner('preview')} onKeyDownCapture={() => markScrollOwner('preview')} onWheelCapture={onPreviewWheel} onScroll={onPreviewScroll} onClick={toggleTask} dangerouslySetInnerHTML={{ __html: html }}/></div></div></div>;
}
