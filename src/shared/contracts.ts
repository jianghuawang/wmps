import { z } from 'zod';
import type { FileKind } from './file-types.js';

export const pathSchema = z.string().min(1).max(4096).refine((value) => !value.includes('\0'), 'Invalid path');
export const bytesSchema = z.instanceof(Uint8Array);

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  kind: FileKind;
  children?: TreeNode[];
}

export const treeNodeSchema: z.ZodType<TreeNode> = z.lazy(() => z.object({
  name: z.string(),
  path: pathSchema,
  type: z.enum(['file', 'directory']),
  kind: z.enum(['markdown', 'word', 'word-legacy', 'spreadsheet', 'spreadsheet-legacy', 'csv', 'html', 'pdf', 'unsupported']),
  children: z.array(treeNodeSchema).optional()
}));

export const fileSnapshotSchema = z.object({
  detectedKind: z.enum(['markdown', 'word', 'word-legacy', 'spreadsheet', 'spreadsheet-legacy', 'csv', 'html', 'pdf', 'unsupported']).optional(),
  path: pathSchema,
  bytes: bytesSchema,
  mtimeMs: z.number().nonnegative(),
  size: z.number().int().nonnegative()
});
export type FileSnapshot = z.infer<typeof fileSnapshotSchema>;

export const writeFileRequestSchema = z.object({
  path: pathSchema,
  bytes: bytesSchema,
  expectedMtimeMs: z.number().nonnegative().optional()
});

export const sessionTabSchema = z.object({
  path: pathSchema,
  scrollTop: z.number().default(0),
  zoom: z.number().min(0.25).max(5).default(1),
  splitRatio: z.number().min(0.2).max(0.8).default(0.5)
});

export const sessionStateSchema = z.object({
  workspaceRoot: pathSchema.nullable().default(null),
  tabs: z.array(sessionTabSchema).default([]),
  activePath: pathSchema.nullable().default(null),
  sidebarVisible: z.boolean().default(true),
  sidebarWidth: z.number().min(190).max(520).default(260),
  language: z.enum(['en', 'zh-CN']).default('en')
});
export type SessionState = z.infer<typeof sessionStateSchema>;

export const searchRequestSchema = z.object({ root: pathSchema, query: z.string().min(1).max(500) });
export const searchResultSchema = z.object({ path: pathSchema, line: z.number().int().positive(), column: z.number().int().positive(), preview: z.string(), location: z.string().optional() });
export type SearchResult = z.infer<typeof searchResultSchema>;

export const recoveryRecordSchema = z.object({
  path: pathSchema,
  bytes: bytesSchema,
  savedAt: z.number().int().positive(),
  sourceMtimeMs: z.number().nonnegative()
});
export type RecoveryRecord = z.infer<typeof recoveryRecordSchema>;

export const workspaceChangeSchema = z.object({
  root: pathSchema,
  path: pathSchema,
  event: z.enum(['add', 'addDir', 'change', 'unlink', 'unlinkDir'])
});
export type WorkspaceChange = z.infer<typeof workspaceChangeSchema>;
export const unsavedDecisionSchema = z.enum(['save', 'discard', 'cancel']);
export type UnsavedDecision = z.infer<typeof unsavedDecisionSchema>;

export type MenuCommand =
  | 'new-markdown' | 'new-word' | 'new-spreadsheet' | 'open-file' | 'open-folder'
  | 'save' | 'save-all' | 'close-tab' | 'toggle-sidebar' | 'toggle-preview'
  | 'quick-open' | 'workspace-search' | 'find' | 'zoom-in' | 'zoom-out' | 'zoom-reset';

export interface WmsApi {
  platform: NodeJS.Platform;
  setTheme(theme: 'light' | 'dark' | 'system'): Promise<void>;
  chooseWorkspace(): Promise<string | null>;
  openWorkspaceWindow(root?: string | null): Promise<string | null>;
  chooseFiles(): Promise<string[]>;
  openWorkspace(root: string): Promise<TreeNode>;
  readFile(path: string): Promise<FileSnapshot>;
  writeFile(request: z.infer<typeof writeFileRequestSchema>): Promise<FileSnapshot>;
  createFile(path: string, bytes: Uint8Array): Promise<FileSnapshot>;
  createDirectory(path: string): Promise<void>;
  renamePath(path: string, nextPath: string): Promise<void>;
  duplicatePath(path: string): Promise<string>;
  trashPath(path: string): Promise<void>;
  revealPath(path: string): Promise<void>;
  copyPath(path: string): Promise<void>;
  searchWorkspace(root: string, query: string): Promise<SearchResult[]>;
  loadSession(): Promise<SessionState>;
  saveSession(session: SessionState): Promise<void>;
  loadRecovery(path: string): Promise<RecoveryRecord | null>;
  saveRecovery(record: RecoveryRecord): Promise<void>;
  deleteRecovery(path: string): Promise<void>;
  getRecentWorkspaces(): Promise<string[]>;
  showContextMenu(path: string, isDirectory: boolean): Promise<void>;
  confirmUnsaved(names: string[], closingApp: boolean): Promise<UnsavedDecision>;
  pathForDroppedFile(file: File): string;
  allowDroppedFiles(paths: string[]): Promise<void>;
  confirmClose(): void;
  cancelClose(): void;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  onWorkspaceChanged(listener: (change: WorkspaceChange) => void): () => void;
  onOpenPaths(listener: (paths: string[]) => void): () => void;
  onBeforeClose(listener: () => void): () => void;
}
