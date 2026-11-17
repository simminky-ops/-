import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { all, get, run } from "@/lib/server/db";
import { hashPassword, passwordPolicyErrors } from "@/lib/server/password";
import { audit } from "@/lib/server/audit";
import { ROLE_LABEL, type RoleCode } from "@/lib/types";

export async function GET() {
  try {
    await requireApi("admin");
    return Response.json({
      users: all("SELECT id, username, name, role_code, pii_access, active, last_login_at, locked_until, created_at FROM users ORDER BY id"),
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireApi("admin", true);
    const b = (await req.json()) as { username?: string; name?: string; role?: RoleCode; password?: string; pii?: boolean };
    if (!b.username || !/^[a-z0-9_.-]{3,30}$/.test(b.username)) throw new HttpError(422, "아이디는 영문 소문자·숫자 3~30자");
    if (!b.name) throw new HttpError(422, "이름을 입력하세요.");
    if (!b.role || !(b.role in ROLE_LABEL)) throw new HttpError(422, "역할을 선택하세요.");
    const pe = passwordPolicyErrors(b.password ?? "");
    if (pe.length) throw new HttpError(422, "비밀번호 정책 위반", pe);
    if (get("SELECT 1 FROM users WHERE username = ?", b.username)) throw new HttpError(409, "이미 존재하는 아이디입니다.");
    run("INSERT INTO users(username, name, role_code, password_hash, pii_access) VALUES(?,?,?,?,?)", b.username, b.name, b.role, hashPassword(b.password!), b.pii ? 1 : 0);
    audit(admin, "USER_CREATE", "users", b.username, null, { name: b.name, role: b.role, pii: !!b.pii }, null);
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireApi("admin", true);
    const b = (await req.json()) as { id: number; role?: RoleCode; active?: boolean; pii?: boolean; password?: string };
    const before = get<{ id: number; username: string; role_code: string; active: number; pii_access: number }>("SELECT id, username, role_code, active, pii_access FROM users WHERE id = ?", b.id);
    if (!before) throw new HttpError(404, "사용자를 찾을 수 없습니다.");
    if (before.id === admin.id && (b.active === false || (b.role && b.role !== "ADMIN"))) throw new HttpError(409, "본인 계정의 관리자 권한/활성 상태는 변경할 수 없습니다.");
    if (b.role) {
      if (!(b.role in ROLE_LABEL)) throw new HttpError(422, "잘못된 역할");
      run("UPDATE users SET role_code = ?, updated_at = datetime('now') WHERE id = ?", b.role, b.id);
    }
    if (b.active !== undefined) {
      run("UPDATE users SET active = ?, updated_at = datetime('now') WHERE id = ?", b.active ? 1 : 0, b.id);
      if (!b.active) run("DELETE FROM sessions WHERE user_id = ?", b.id);
    }
    if (b.pii !== undefined) run("UPDATE users SET pii_access = ?, updated_at = datetime('now') WHERE id = ?", b.pii ? 1 : 0, b.id);
    if (b.password) {
      const pe = passwordPolicyErrors(b.password);
      if (pe.length) throw new HttpError(422, "비밀번호 정책 위반", pe);
      run("UPDATE users SET password_hash = ?, failed_count = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?", hashPassword(b.password), b.id);
      run("DELETE FROM sessions WHERE user_id = ?", b.id);
    }
    audit(admin, "USER_UPDATE", "users", before.username, before, { role: b.role, active: b.active, pii: b.pii, passwordReset: !!b.password }, null);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
