export interface EditorViewState { scrollTop?: number; zoom?: number; splitRatio?: number; selection?: unknown; }

export interface EditorHandle {
  serialize(): Promise<Uint8Array>;
  focusSearch(): void;
  revealResult?(query: string, line: number, location?: string): void;
  zoomBy?(factor: number): void;
  getViewState(): EditorViewState;
}

export interface EditorProps {
  path: string;
  bytes: Uint8Array;
  initialState?: EditorViewState;
  onDirtyChange(dirty: boolean): void;
  onStatusChange?(status: string): void;
  registerHandle(handle: EditorHandle | null): void;
}
