import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { recoveryRecordSchema, sessionStateSchema, type RecoveryRecord, type SessionState } from '../shared/contracts.js';

const emptySession: SessionState = { workspaceRoot: null, tabs: [], activePath: null, sidebarVisible: true, sidebarWidth: 260, language: 'en' };

async function atomicWrite(path: string, bytes: Uint8Array | string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

export class StateStore {
  private readonly statePath = join(app.getPath('userData'), 'state.json');
  private readonly recoveryRoot = join(app.getPath('userData'), 'recovery');
  private recentWorkspaces: string[] = [];
  private latestSession: SessionState = emptySession;
  private workspaceSessions: Record<string, SessionState> = {};
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  private async ensureLoaded() {
    if (this.loaded) return;
    try {
      const data = JSON.parse(await readFile(this.statePath, 'utf8')) as unknown;
      this.latestSession = sessionStateSchema.parse(data);
      this.recentWorkspaces = Array.isArray((data as { recentWorkspaces?: unknown }).recentWorkspaces)
        ? (data as { recentWorkspaces: unknown[] }).recentWorkspaces.filter((value): value is string => typeof value === 'string').slice(0, 100)
        : [];
      const storedSessions = (data as { workspaceSessions?: unknown }).workspaceSessions;
      if (storedSessions && typeof storedSessions === 'object') for (const [root, session] of Object.entries(storedSessions)) {
        const parsed = sessionStateSchema.safeParse(session); if (parsed.success) this.workspaceSessions[root] = parsed.data;
      }
      if (this.latestSession.workspaceRoot && !this.workspaceSessions[this.latestSession.workspaceRoot]) this.workspaceSessions[this.latestSession.workspaceRoot] = this.latestSession;
    } catch { /* First launch or unreadable legacy state. */ }
    this.loaded = true;
  }

  async loadSession(workspaceRoot?: string | null): Promise<SessionState> {
    await this.ensureLoaded();
    if (!workspaceRoot) return this.latestSession;
    return this.workspaceSessions[workspaceRoot] ?? { ...emptySession, workspaceRoot };
  }

  async saveSession(session: SessionState) {
    await this.ensureLoaded();
    const parsed = sessionStateSchema.parse(session);
    this.latestSession = parsed;
    if (parsed.workspaceRoot) { this.addRecent(parsed.workspaceRoot); this.workspaceSessions[parsed.workspaceRoot] = parsed; }
    await this.persist();
  }

  getRecents() { return [...this.recentWorkspaces]; }
  addRecent(path: string) { this.recentWorkspaces = [path, ...this.recentWorkspaces.filter((item) => item !== path)].slice(0, 100); }
  async rememberWorkspace(path: string) { await this.ensureLoaded(); this.addRecent(path); await this.persist(); }

  private async persist() {
    const payload = JSON.stringify({ ...this.latestSession, recentWorkspaces: this.recentWorkspaces, workspaceSessions: this.workspaceSessions }, null, 2);
    this.writeQueue = this.writeQueue.then(() => atomicWrite(this.statePath, payload)); await this.writeQueue;
  }

  private recoveryPath(path: string) {
    const name = createHash('sha256').update(path).digest('hex');
    return join(this.recoveryRoot, `${name}.recovery`);
  }

  async saveRecovery(record: RecoveryRecord) {
    const parsed = recoveryRecordSchema.parse(record);
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Encrypted recovery is unavailable on this system');
    const payload = Buffer.from(JSON.stringify({ ...parsed, bytes: Buffer.from(parsed.bytes).toString('base64') }));
    const bytes = safeStorage.encryptString(payload.toString('utf8'));
    await atomicWrite(this.recoveryPath(parsed.path), bytes);
  }

  async loadRecovery(path: string): Promise<RecoveryRecord | null> {
    try {
      const encrypted = await readFile(this.recoveryPath(path));
      if (!safeStorage.isEncryptionAvailable()) return null;
      const json = safeStorage.decryptString(encrypted);
      const value = JSON.parse(json) as Omit<RecoveryRecord, 'bytes'> & { bytes: string };
      return recoveryRecordSchema.parse({ ...value, bytes: new Uint8Array(Buffer.from(value.bytes, 'base64')) });
    } catch { return null; }
  }

  async deleteRecovery(path: string) {
    try { await unlink(this.recoveryPath(path)); } catch { /* already absent */ }
  }
}
