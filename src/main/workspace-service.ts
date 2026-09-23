import { BrowserWindow, clipboard, shell } from 'electron';
import chokidar, { type FSWatcher } from 'chokidar';
import { copyFile, mkdir, open, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { classifyFile, detectFileKind } from '../shared/file-types.js';
import type { FileSnapshot, SearchResult, TreeNode } from '../shared/contracts.js';

import { extractSearchText, type SearchSection } from './search-text.js';

const hiddenDirectories = new Set(['.git', '.claude', '.serena', 'node_modules', '.npm-cache', 'dist', 'dist-electron', 'release']);

function inside(root: string, candidate: string) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !rel.includes(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

export class WorkspaceService {
  private searchCache = new Map<string, { mtime: number; size: number; sections: SearchSection[] }>();
  private workspaceRoot: string | null = null;
  private watcher: FSWatcher | null = null;
  private readonly explicitFiles = new Set<string>();
  private readonly selfWrites = new Map<string, number>();

  allowFile(path: string) { this.explicitFiles.add(resolve(path)); }

  private async assertAllowed(path: string, forCreation = false) {
    const absolute = resolve(path);
    if (this.explicitFiles.has(absolute)) return absolute;
    if (!this.workspaceRoot) throw new Error('No workspace grants access to this path');
    const checked = forCreation ? join(await realpath(dirname(absolute)), basename(absolute)) : await realpath(absolute);
    if (!inside(this.workspaceRoot, checked)) throw new Error('Path is outside the active workspace');
    return checked;
  }

  async openWorkspace(root: string, window: BrowserWindow): Promise<TreeNode> {
    const canonical = await realpath(root);
    const info = await stat(canonical);
    if (!info.isDirectory()) throw new Error('Workspace must be a folder');
    this.workspaceRoot = canonical;
    await this.watcher?.close();
    this.watcher = chokidar.watch(canonical, { ignoreInitial: true, depth: 30, ignored: (path) => hiddenDirectories.has(basename(path)) });
    let notification: NodeJS.Timeout | undefined;
    this.watcher.on('all', (event, changedPath) => {
      if (changedPath.endsWith('.wmps-save')) return;
      if ((this.selfWrites.get(resolve(changedPath)) ?? 0) > Date.now()) return;
      clearTimeout(notification);
      notification = setTimeout(() => window.webContents.send('workspace:changed', { root: canonical, path: resolve(changedPath), event }), 120);
    });
    return this.scan(canonical);
  }

  private async scan(path: string, depth = 0): Promise<TreeNode> {
    const info = await stat(path);
    if (!info.isDirectory()) return { name: basename(path), path, type: 'file', kind: classifyFile(path) };
    const children: TreeNode[] = [];
    if (depth < 30) {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
        if (hiddenDirectories.has(entry.name)) continue;
        const childPath = join(path, entry.name);
        if (entry.isSymbolicLink()) continue;
        children.push(await this.scan(childPath, depth + 1));
      }
    }
    return { name: basename(path), path, type: 'directory', kind: 'unsupported', children };
  }

  async read(path: string): Promise<FileSnapshot> {
    const allowed = await this.assertAllowed(path);
    const info = await stat(allowed);
    let bytes: Uint8Array<ArrayBuffer>;
    if (extname(allowed).toLowerCase() === '.doc' && process.platform === 'darwin') bytes = await this.convertLegacyDoc(allowed);
    else bytes = Uint8Array.from(await readFile(allowed));
    return { path, bytes, detectedKind: detectFileKind(path, bytes), mtimeMs: info.mtimeMs, size: info.size };
  }

  private convertLegacyDoc(path: string): Promise<Uint8Array<ArrayBuffer>> {
    return new Promise((resolvePromise, reject) => {
      const process = spawn('/usr/bin/textutil', ['-convert', 'docx', '-stdout', path], { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = []; const errors: Buffer[] = [];
      process.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      process.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
      process.on('close', (code) => code === 0 ? resolvePromise(Uint8Array.from(Buffer.concat(chunks))) : reject(new Error(Buffer.concat(errors).toString() || 'Legacy Word conversion failed')));
    });
  }

  async write(path: string, bytes: Uint8Array, expectedMtimeMs?: number): Promise<FileSnapshot> {
    const allowed = await this.assertAllowed(path, true);
    try {
      const current = await stat(allowed);
      if (expectedMtimeMs !== undefined && Math.abs(current.mtimeMs - expectedMtimeMs) > 1) throw new Error('FILE_CHANGED_ON_DISK');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await mkdir(dirname(allowed), { recursive: true });
    const temporary = `${allowed}.${process.pid}.wmps-save`;
    this.selfWrites.set(allowed, Date.now() + 1000);
    await writeFile(temporary, bytes);
    await rename(temporary, allowed);
    this.explicitFiles.add(allowed);
    return this.read(allowed);
  }

  async create(path: string, bytes: Uint8Array): Promise<FileSnapshot> {
    const allowed = await this.assertAllowed(path, true);
    await writeFile(allowed, bytes, { flag: 'wx' });
    return this.read(allowed);
  }

  async createDirectory(path: string) { await mkdir(await this.assertAllowed(path, true)); }
  async rename(path: string, nextPath: string) { await rename(await this.assertAllowed(path), await this.assertAllowed(nextPath, true)); }

  async duplicate(path: string) {
    const source = await this.assertAllowed(path);
    const extension = extname(source); const stem = basename(source, extension);
    let index = 1; let target = join(dirname(source), `${stem} copy${extension}`);
    while (true) {
      try { await open(target, 'wx').then((handle) => handle.close()); break; }
      catch { index += 1; target = join(dirname(source), `${stem} copy ${index}${extension}`); }
    }
    await copyFile(source, target); return target;
  }

  async trash(path: string) { await shell.trashItem(await this.assertAllowed(path)); }
  async reveal(path: string) { shell.showItemInFolder(await this.assertAllowed(path)); }
  async copyPath(path: string) { clipboard.writeText(await this.assertAllowed(path)); }

  async search(root: string, query: string): Promise<SearchResult[]> {
    const canonical = await this.assertAllowed(root);
    const results: SearchResult[] = [];
    const walk = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || hiddenDirectories.has(entry.name) || results.length >= 500) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (classifyFile(path) !== 'unsupported' && (await stat(path)).size <= 30_000_000) {
          const info = await stat(path); let sections: SearchSection[];
          try {
            const cached = this.searchCache.get(path);
            if (cached?.mtime === info.mtimeMs && cached.size === info.size) sections = cached.sections;
            else { sections = await extractSearchText(path, (await this.read(path)).bytes); this.searchCache.set(path, { mtime: info.mtimeMs, size: info.size, sections }); }
          } catch { sections = []; }
          const term = query.toLocaleLowerCase();
          if (entry.name.toLocaleLowerCase().includes(term)) results.push({ path, line: 1, column: 1, preview: entry.name, location: 'File name' });
          sections.forEach((section, index) => {
            const match = section.text.toLocaleLowerCase().indexOf(term);
            if (match >= 0 && results.length < 500) {
              const start = Math.max(0, match - 60);
              results.push({ path, line: index + 1, column: match + 1, location: section.location, preview: (start ? '…' : '') + section.text.slice(start, match + query.length + 150) });
            }
          });
        }
      }
    };
    await walk(canonical); return results;
  }

  async dispose() { await this.watcher?.close(); }
}
