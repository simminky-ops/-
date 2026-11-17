import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BACKUP_DIR, DB_PATH, closeDb, getDb } from "./db";
import { invalidateSnapshot } from "./snapshot";

const NAME_RE = /^ad-backup-\d{8}-\d{6}(-[a-z]+)?\.db$/;

export function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => NAME_RE.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: st.size, created: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** 온라인 백업: VACUUM INTO (일관된 스냅샷 파일 생성) */
export function createBackup(tag = "manual"): string {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const name = `ad-backup-${ts}-${tag.replace(/[^a-z]/g, "")}.db`;
  const target = path.join(BACKUP_DIR, name);
  getDb().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  // 보관정책: 최근 30개 유지
  for (const old of listBackups().slice(30)) fs.rmSync(path.join(BACKUP_DIR, old.name), { force: true });
  return name;
}

export function backupPath(name: string): string {
  if (!NAME_RE.test(name)) throw new Error("잘못된 백업 파일명입니다.");
  const p = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(p)) throw new Error("백업 파일이 없습니다.");
  return p;
}

/** 복구: 무결성 검사 → 현재 DB 자동백업 → 파일 교체 → 재연결 */
export function restoreBackup(name: string): string {
  const src = backupPath(name);
  const check = new DatabaseSync(src, { readOnly: true });
  const ok = (check.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
  const hasUsers = check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  check.close();
  if (ok !== "ok" || !hasUsers) throw new Error("백업 파일 무결성 검사에 실패했습니다.");
  const safety = createBackup("prerestore");
  closeDb();
  for (const ext of ["-wal", "-shm"]) fs.rmSync(DB_PATH + ext, { force: true });
  fs.copyFileSync(src, DB_PATH);
  invalidateSnapshot();
  getDb();
  return safety;
}
