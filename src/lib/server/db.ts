import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";
import { ensureSeeded } from "./seed";

// 데이터 폴더는 런타임 경로(배포 추적 대상 아님)
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.AD_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));
export const DB_PATH = path.join(DATA_DIR, "ad-project.db");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");

type G = typeof globalThis & { __adDb?: DatabaseSync };
const g = globalThis as G;

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA_SQL);
  return db;
}

export function getDb(): DatabaseSync {
  if (!g.__adDb) {
    g.__adDb = open();
    // 최초 실행 시 예시 데이터 자동 적재
    ensureSeeded(g.__adDb);
  }
  return g.__adDb;
}

/** 백업 복구 등으로 DB 파일을 교체할 때 연결을 닫고 다시 엽니다. */
export function closeDb() {
  if (g.__adDb) {
    g.__adDb.close();
    g.__adDb = undefined;
  }
}

export type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...(params as never[])).map((r) => ({ ...r })) as T[];
}
export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  const r = getDb().prepare(sql).get(...(params as never[]));
  return (r ? { ...r } : undefined) as T | undefined;
}
export function run(sql: string, ...params: unknown[]) {
  return getDb().prepare(sql).run(...(params as never[]));
}

let txDepth = 0;
/** 트랜잭션 (중첩 호출 시 바깥 트랜잭션에 합류) */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  if (txDepth > 0) return fn();
  db.exec("BEGIN IMMEDIATE");
  txDepth++;
  try {
    const r = fn();
    txDepth--;
    db.exec("COMMIT");
    return r;
  } catch (e) {
    txDepth--;
    db.exec("ROLLBACK");
    throw e;
  }
}

export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ---------- 설정 / 데이터 버전 ----------
export function getSetting<T>(key: string, fallback: T): T {
  const r = get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  if (!r) return fallback;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown) {
  run(
    "INSERT INTO settings(key, value, updated_at) VALUES(?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    key,
    JSON.stringify(value),
  );
}

/** 모든 데이터 변경 시 증가 — 보고서의 '데이터 버전' */
export function bumpDataVersion(): number {
  const v = getSetting<number>("data_version", 0) + 1;
  setSetting("data_version", v);
  return v;
}
