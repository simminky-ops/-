import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { get, run } from "./db";
import { verifyPassword } from "./password";
import { canRead, canWrite, type Module } from "../rbac";
import type { RoleCode, SessionUser } from "../types";
import { audit } from "./audit";

export const SESSION_COOKIE = "ad_session";
const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const tokenHash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

interface UserRow {
  id: number;
  username: string;
  name: string;
  role_code: RoleCode;
  password_hash: string;
  pii_access: number;
  active: number;
  failed_count: number;
  locked_until: string | null;
}

export async function login(username: string, password: string): Promise<SessionUser> {
  const u = get<UserRow>("SELECT * FROM users WHERE username = ?", username);
  const now = new Date();
  if (!u || !u.active) {
    audit(null, "LOGIN_FAIL", "users", username, null, null, "존재하지 않거나 비활성 계정");
    throw new HttpError(401, "아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  if (u.locked_until && new Date(u.locked_until) > now) {
    throw new HttpError(423, `로그인 시도 초과로 계정이 잠겼습니다. ${LOCK_MINUTES}분 후 다시 시도하세요.`);
  }
  if (!verifyPassword(password, u.password_hash)) {
    const fails = u.failed_count + 1;
    const lock = fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() : null;
    run("UPDATE users SET failed_count = ?, locked_until = ? WHERE id = ?", lock ? 0 : fails, lock, u.id);
    audit(null, "LOGIN_FAIL", "users", username, null, null, lock ? "계정 잠금" : `실패 ${fails}회`);
    throw new HttpError(401, "아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(now.getTime() + SESSION_HOURS * 3600000).toISOString();
  run("INSERT INTO sessions(id, user_id, expires_at) VALUES(?, ?, ?)", tokenHash(token), u.id, expires);
  run("UPDATE users SET failed_count = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?", u.id);
  run("DELETE FROM sessions WHERE expires_at < ?", now.toISOString());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.AD_INSECURE_COOKIE !== "1",
    path: "/",
    expires: new Date(expires),
  });
  const user: SessionUser = { id: u.id, username: u.username, name: u.name, role: u.role_code, piiAccess: !!u.pii_access };
  audit(user, "LOGIN", "users", u.username, null, null, null);
  return user;
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) run("DELETE FROM sessions WHERE id = ?", tokenHash(t));
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (!t) return null;
  const row = get<UserRow & { expires_at: string }>(
    "SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
    tokenHash(t),
  );
  if (!row || !row.active || new Date(row.expires_at) < new Date()) return null;
  return { id: row.id, username: row.username, name: row.name, role: row.role_code, piiAccess: !!row.pii_access };
}

/** API 라우트용: 인증 + 모듈 권한 검사 (서버 측 최종 판정) */
export async function requireApi(module?: Module, write = false): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new HttpError(401, "로그인이 필요합니다.");
  if (module && !(write ? canWrite(u.role, module) : canRead(u.role, module)))
    throw new HttpError(403, `권한이 없습니다 (${module}${write ? " 쓰기" : " 조회"}).`);
  // CSRF 완화: 쓰기 요청은 동일 출처만 허용
  if (write) {
    const h = await headers();
    const origin = h.get("origin");
    const host = h.get("host");
    if (origin && host && new URL(origin).host !== host) throw new HttpError(403, "허용되지 않은 출처의 요청입니다.");
  }
  return u;
}

/** 페이지용: 미로그인 → /login, 권한 없음 → /forbidden */
export async function requirePage(module?: Module): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (module && !canRead(u.role, module)) redirect(`/forbidden?m=${module}`);
  return u;
}

export function apiError(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message, details: e.details }, { status: e.status });
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  if (/FOREIGN KEY/i.test(msg)) return Response.json({ error: "연결된 데이터가 있어 처리할 수 없습니다 (참조 무결성)." }, { status: 409 });
  if (/UNIQUE|PRIMARY KEY/i.test(msg)) return Response.json({ error: "이미 존재하는 ID입니다 (중복)." }, { status: 409 });
  return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
}
