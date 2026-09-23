import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocaleType } from '@univerjs/core';
import { createUniver, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import UniverPresetSheetsCoreZhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import { useTranslation } from 'react-i18next';
import { sheetJsToUniver, univerToWorkbookBytes } from './spreadsheet/mapping';
import type { EditorHandle, EditorProps } from './types';
import { clampZoom } from './document-zoom';
import { useDocumentPinchZoom } from '../hooks/useDocumentPinchZoom';
import '@univerjs/preset-sheets-core/lib/index.css';

interface WorkbookFacade {
  save(): ReturnType<typeof sheetJsToUniver>;
  dispose(): void;
  getActiveSheet(): { zoom(value: number): unknown; getZoom(): number };
}

export default function SpreadsheetEditor({ path, bytes, onDirtyChange, registerHandle, initialState }: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null); const containerRef = useRef<HTMLDivElement>(null); const workbookRef = useRef<WorkbookFacade | null>(null); const [zoom, setZoom] = useState(initialState?.zoom ?? 1); const { i18n } = useTranslation();
  const snapshot = useMemo(() => sheetJsToUniver(bytes, path.split(/[\\/]/).pop() ?? 'Workbook'), [bytes, path]);
  const scaleDocument = useCallback((factor: number) => {
    const sheet = workbookRef.current?.getActiveSheet(); if (!sheet) return;
    const next = clampZoom(sheet.getZoom() * factor, .25, 3); sheet.zoom(next); setZoom(next);
  }, []);
  useDocumentPinchZoom(rootRef, scaleDocument);
  useEffect(() => {
    if (!containerRef.current) return;
    const locale = i18n.language === 'zh-CN' ? LocaleType.ZH_CN : LocaleType.EN_US;
    const { univer, univerAPI } = createUniver({ locale, locales: {
      [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS), [LocaleType.ZH_CN]: mergeLocales(UniverPresetSheetsCoreZhCN)
    }, presets: [UniverSheetsCorePreset({ container: containerRef.current })] });
    const media = matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => univerAPI.toggleDarkMode(media.matches);
    updateTheme(); media.addEventListener('change', updateTheme);
    const ignoreChangesUntil = performance.now() + 1200;
    const disposable = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
      if (performance.now() < ignoreChangesUntil) return;
      const id = String((event as { id?: string }).id ?? '');
      if (/set|insert|remove|delete|move|merge|rename|update|paste|cut/i.test(id)) onDirtyChange(true);
    });
    const zoomDisposable = univerAPI.addEvent(univerAPI.Event.SheetZoomChanged, (event) => {
      setZoom((event as { zoom: number }).zoom);
    });
    // Univer mounts its React workbench asynchronously. Creating a workbook in the
    // same task can race the render host registration and leave the sheet canvas
    // permanently unmounted, even though the ribbon and sheet tabs appear.
    const mountTimer = window.setTimeout(() => {
      const workbook = univerAPI.createWorkbook({ ...snapshot, locale }); workbookRef.current = workbook;
      const initialZoom = clampZoom(initialState?.zoom ?? 1, .25, 3); workbook.getActiveSheet().zoom(initialZoom); setZoom(initialZoom);
    }, 0);
    return () => { media.removeEventListener('change', updateTheme); window.clearTimeout(mountTimer); disposable.dispose(); zoomDisposable.dispose(); workbookRef.current?.dispose(); univer.dispose(); workbookRef.current = null; };
  }, [snapshot, i18n.language, onDirtyChange, initialState?.zoom]);
  useEffect(() => {
    const handle: EditorHandle = { serialize: async () => univerToWorkbookBytes(workbookRef.current?.save() ?? snapshot, path.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'), focusSearch: () => { containerRef.current?.focus(); containerRef.current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true })); }, zoomBy: scaleDocument, getViewState: () => ({ zoom: workbookRef.current?.getActiveSheet().getZoom() ?? zoom }) };
    registerHandle(handle); return () => registerHandle(null);
  }, [path, registerHandle, snapshot, zoom, scaleDocument]);
  return <div ref={rootRef} className="format-editor spreadsheet-editor" data-document-zoom={zoom.toFixed(3)}><div ref={containerRef} className="univer-host" tabIndex={-1}/></div>;
}
