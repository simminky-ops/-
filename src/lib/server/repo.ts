import "server-only";
// 엔티티 공통 저장소: 권한(모듈·담당자·기밀) → 정규화·검증 → 중복검사 → 저장/승인요청 → 감사로그
import { all, bumpDataVersion, get, run, tx, type Row } from "./db";
import { HttpError } from "./auth";
import { audit } from "./audit";
import { ENTITIES, normalizeRow, type EntityDef, type EntityName } from "../entities";
import { APPROVER_ROLES, canRead, canWrite } from "../rbac";
import type { SessionUser } from "../types";

const TABLE: Record<EntityName, string> = Object.fromEntries(
  (Object.keys(ENTITIES) as EntityName[]).map((k) => [k, k]),
) as Record<EntityName, string>;

export function maskValue(v: unknown): unknown {
  if (v === null || v === undefined || v === "") return v;
  const s = String(v);
  if (/^\d{2,3}-\d{3,4}-\d{4}$/.test(s)) return s.replace(/-(\d{3,4})-/, "-****-");
  if (s.includes("@")) return s.replace(/^(.).*(@.*)$/, "$1***$2");
  if (s.length <= 1) return "*";
  return s[0] + "*".repeat(Math.min(s.length - 1, 6));
}

function piiAllowed(user: SessionUser, def: EntityDef, row: Row): boolean {
  if (!user.piiAccess) return false;
  if (user.role === "SALES" && def.ownerField) return row[def.ownerField] === user.name;
  return true;
}

export function sanitizeRow(user: SessionUser, def: EntityDef, row: Row): Row {
  const out: Row = { ...row };
  const allowed = piiAllowed(user, def, row);
  for (const f of def.fields) if (f.pii && !allowed) out[f.key] = maskValue(out[f.key]);
  return out;
}

function confidentialHidden(user: SessionUser, def: EntityDef, row: Row) {
  return def.confidentialField && Number(row[def.confidentialField]) === 1 && !canRead(user.role, "risks_confidential");
}

function assertRead(user: SessionUser, def: EntityDef) {
  if (!canRead(user.role, def.module)) throw new HttpError(403, `${def.label} 조회 권한이 없습니다.`);
}

function assertWrite(user: SessionUser, def: EntityDef, row?: Row) {
  if (!canWrite(user.role, def.module)) throw new HttpError(403, `${def.label} 수정 권한이 없습니다.`);
  if (row && def.ownerField && def.ownerRoles?.includes(user.role) && row[def.ownerField] && row[def.ownerField] !== user.name)
    throw new HttpError(403, `본인 배정 건만 수정할 수 있습니다 (담당: ${String(row[def.ownerField])}).`);
  if (row && confidentialHidden(user, def, row)) throw new HttpError(403, "법률 기밀 건은 권한 있는 담당자만 수정할 수 있습니다.");
}

export function listRows(user: SessionUser, name: EntityName, where?: { sql: string; params: unknown[] }): Row[] {
  const def = ENTITIES[name];
  assertRead(user, def);
  const order = def.defaultSort.replace(/[^a-z_ ,]/gi, "");
  const rows = all(`SELECT * FROM ${TABLE[name]}${where ? ` WHERE ${where.sql}` : ""} ORDER BY ${order}`, ...(where?.params ?? []));
  return rows.filter((r) => !confidentialHidden(user, def, r)).map((r) => sanitizeRow(user, def, r));
}

export function getRow(user: SessionUser, name: EntityName, id: string): Row {
  const def = ENTITIES[name];
  assertRead(user, def);
  const r = get(`SELECT * FROM ${TABLE[name]} WHERE id = ?`, id);
  if (!r || confidentialHidden(user, def, r)) throw new HttpError(404, `${def.label} ${id} 을(를) 찾을 수 없습니다.`);
  return sanitizeRow(user, def, r);
}

function nextId(def: EntityDef): string {
  const prefix = def.idPrefix!;
  const r = get<{ id: string }>(
    `SELECT id FROM ${TABLE[def.name]} WHERE id LIKE ? ORDER BY length(id) DESC, id DESC LIMIT 1`,
    `${prefix}%`,
  );
  const n = r ? Number(r.id.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(def.idPad, "0")}`;
}

/** 업무 규칙 검증 (교차 테이블) */
function businessChecks(name: EntityName, row: Row, existingId?: string): string[] {
  const e: string[] = [];
  const contractLinked = ["payments", "deferrals", "receivables"].includes(name);
  if (contractLinked) {
    const c = get<{ asset_id: string; status: string }>("SELECT asset_id, status FROM sale_contracts WHERE id = ?", row.contract_id);
    if (!c) e.push(`계약 ID ${String(row.contract_id)} 이(가) 존재하지 않습니다.`);
    else row.asset_id = c.asset_id; // 자산 ID 자동 연결
  }
  if (name === "sale_contracts") {
    if (!get("SELECT 1 FROM assets WHERE id = ?", row.asset_id)) e.push(`자산 ID ${String(row.asset_id)} 이(가) 존재하지 않습니다.`);
    if (row.status !== "TERMINATED") {
      const dup = get<{ id: string }>(
        "SELECT id FROM sale_contracts WHERE asset_id = ? AND status <> 'TERMINATED' AND id <> ?",
        row.asset_id,
        existingId ?? "",
      );
      if (dup) e.push(`자산 ${String(row.asset_id)} 에 유효한 계약(${dup.id})이 이미 있습니다. 기존 계약 해지 후 재판매로 등록하세요.`);
    }
    if (row.is_resale && !row.prev_contract_id) e.push("재판매 계약은 직전(해지)계약 ID가 필요합니다.");
  }
  if (name === "payments") {
    const dup = get<{ id: string }>(
      "SELECT id FROM payments WHERE contract_id = ? AND pay_type = ? AND amount = ? AND paid_date = ? AND id <> ?",
      row.contract_id,
      row.pay_type,
      row.amount,
      row.paid_date,
      existingId ?? "",
    );
    if (dup) e.push(`동일한 수납내역(${dup.id})이 이미 등록되어 있습니다 (중복 방지).`);
    if (row.deferral_id && !get("SELECT 1 FROM deferrals WHERE id = ? AND contract_id = ?", row.deferral_id, row.contract_id))
      e.push("유예 ID가 해당 계약의 유예 건이 아닙니다.");
  }
  if (["leases", "issues"].includes(name) && row.asset_id && !get("SELECT 1 FROM assets WHERE id = ?", row.asset_id))
    e.push(`자산 ID ${String(row.asset_id)} 이(가) 존재하지 않습니다.`);
  if (name === "leases" && ["CONTRACTED", "OPEN"].includes(String(row.negotiation_status))) {
    const dup = get<{ id: string }>(
      "SELECT id FROM leases WHERE asset_id = ? AND negotiation_status IN ('CONTRACTED','OPEN') AND id <> ? AND (end_date IS NULL OR end_date >= ?)",
      row.asset_id,
      existingId ?? "",
      row.start_date ?? "",
    );
    if (dup) e.push(`해당 호실에 기간이 겹치는 임대계약(${dup.id})이 있습니다.`);
  }
  if (name === "debt_repayments" && !get("SELECT 1 FROM debts WHERE id = ?", row.debt_id)) e.push("채무 ID가 존재하지 않습니다.");
  if (name === "collection_actions" && !get("SELECT 1 FROM receivables WHERE id = ?", row.receivable_id)) e.push("채권관리 ID가 존재하지 않습니다.");
  return e;
}

function insertRow(name: EntityName, row: Row) {
  const keys = Object.keys(row);
  run(`INSERT INTO ${TABLE[name]} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`, ...keys.map((k) => row[k]));
}

function updateRowRaw(name: EntityName, id: string, patch: Row) {
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (!keys.length) return;
  run(
    `UPDATE ${TABLE[name]} SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
    ...keys.map((k) => patch[k]),
    id,
  );
}

export function prepareCreate(user: SessionUser, name: EntityName, input: Row): { row: Row; errors: string[] } {
  const def = ENTITIES[name];
  const [row, errors] = normalizeRow(def, input);
  if (def.ownerField && def.ownerRoles?.includes(user.role)) {
    if (!row[def.ownerField]) row[def.ownerField] = user.name;
  }
  errors.push(...(def.validate?.(row) ?? []));
  errors.push(...businessChecks(name, row));
  return { row, errors };
}

export function createRow(user: SessionUser, name: EntityName, input: Row, opts: { bulk?: boolean } = {}): Row {
  const def = ENTITIES[name];
  const { row, errors } = prepareCreate(user, name, input);
  assertWrite(user, def, row);
  if (errors.length) throw new HttpError(422, "입력값 검증 오류", errors);
  if (def.idPrefix) row.id = nextId(def);
  else if (get(`SELECT 1 FROM ${TABLE[name]} WHERE id = ?`, row.id)) throw new HttpError(409, `이미 존재하는 ID입니다: ${String(row.id)}`);
  const write = () => {
    insertRow(name, row);
    audit(user, "CREATE", name, String(row.id), null, row, opts.bulk ? "Excel 업로드" : null);
    if (!opts.bulk) bumpDataVersion();
  };
  if (opts.bulk) write();
  else tx(write);
  return row;
}

export type UpdateResult = { status: "APPLIED"; row: Row } | { status: "PENDING"; approvalId: number; protectedFields: string[] };

export function updateRow(user: SessionUser, name: EntityName, id: string, input: Row, reason?: string): UpdateResult {
  const def = ENTITIES[name];
  const before = get(`SELECT * FROM ${TABLE[name]} WHERE id = ?`, id);
  if (!before) throw new HttpError(404, `${def.label} ${id} 을(를) 찾을 수 없습니다.`);
  assertWrite(user, def, before);
  // 마스킹된 PII 값이 그대로 돌아온 경우 변경하지 않음
  const cleaned: Row = {};
  for (const [k, v] of Object.entries(input)) {
    const f = def.fields.find((x) => x.key === k);
    if (!f || f.readonly || k === "id") continue;
    if (f.pii && typeof v === "string" && v.includes("*")) continue;
    cleaned[k] = v;
  }
  const [patch, errors] = normalizeRow(def, cleaned, { partial: true });
  const merged = { ...before, ...patch };
  errors.push(...(def.validate?.(merged) ?? []));
  errors.push(...businessChecks(name, merged, id));
  if (merged.asset_id !== before.asset_id && ["payments", "deferrals", "receivables"].includes(name)) patch.asset_id = merged.asset_id;
  if (def.ownerField && def.ownerRoles?.includes(user.role) && patch[def.ownerField] && patch[def.ownerField] !== user.name)
    errors.push("담당자를 다른 사람으로 변경할 수 없습니다.");
  if (errors.length) throw new HttpError(422, "입력값 검증 오류", errors);

  const changed = Object.keys(patch).filter((k) => String(patch[k] ?? "") !== String(before[k] ?? ""));
  if (!changed.length) return { status: "APPLIED", row: sanitizeRow(user, def, before) };
  const protectedChanged = changed.filter((k) => def.fields.find((f) => f.key === k)?.protected);
  const diff = Object.fromEntries(changed.map((k) => [k, patch[k]]));
  const beforeDiff = Object.fromEntries(changed.map((k) => [k, before[k]]));

  if (protectedChanged.length && !APPROVER_ROLES.includes(user.role)) {
    return tx(() => {
      run(
        "INSERT INTO approvals(entity_type, entity_id, action, before_json, payload_json, reason, requested_by) VALUES(?,?,?,?,?,?,?)",
        name,
        id,
        "UPDATE",
        JSON.stringify(beforeDiff),
        JSON.stringify(diff),
        reason ?? null,
        user.name,
      );
      const a = get<{ id: number }>("SELECT last_insert_rowid() AS id")!;
      audit(user, "APPROVAL_REQUEST", name, id, beforeDiff, diff, `보호필드 변경: ${protectedChanged.join(", ")}`);
      return { status: "PENDING" as const, approvalId: a.id, protectedFields: protectedChanged };
    });
  }
  return tx(() => {
    updateRowRaw(name, id, diff);
    audit(user, "UPDATE", name, id, beforeDiff, diff, reason ?? null);
    bumpDataVersion();
    return { status: "APPLIED" as const, row: sanitizeRow(user, def, get(`SELECT * FROM ${TABLE[name]} WHERE id = ?`, id)!) };
  });
}

export function deleteRow(user: SessionUser, name: EntityName, id: string, reason?: string): { status: "DELETED" | "PENDING"; approvalId?: number } {
  const def = ENTITIES[name];
  const before = get(`SELECT * FROM ${TABLE[name]} WHERE id = ?`, id);
  if (!before) throw new HttpError(404, `${def.label} ${id} 을(를) 찾을 수 없습니다.`);
  assertWrite(user, def, before);
  if (def.approvalOnDelete && !APPROVER_ROLES.includes(user.role)) {
    return tx(() => {
      run(
        "INSERT INTO approvals(entity_type, entity_id, action, before_json, payload_json, reason, requested_by) VALUES(?,?,?,?,?,?,?)",
        name,
        id,
        "DELETE",
        JSON.stringify(before),
        null,
        reason ?? null,
        user.name,
      );
      const a = get<{ id: number }>("SELECT last_insert_rowid() AS id")!;
      audit(user, "APPROVAL_REQUEST", name, id, before, null, "삭제 승인 요청");
      return { status: "PENDING" as const, approvalId: a.id };
    });
  }
  tx(() => {
    run(`DELETE FROM ${TABLE[name]} WHERE id = ?`, id);
    audit(user, "DELETE", name, id, before, null, reason ?? null);
    bumpDataVersion();
  });
  return { status: "DELETED" };
}

export function decideApproval(user: SessionUser, approvalId: number, approve: boolean, comment?: string) {
  if (!APPROVER_ROLES.includes(user.role)) throw new HttpError(403, "승인 권한이 없습니다.");
  const a = get<{ id: number; entity_type: EntityName; entity_id: string; action: string; payload_json: string | null; status: string; requested_by: string }>(
    "SELECT * FROM approvals WHERE id = ?",
    approvalId,
  );
  if (!a) throw new HttpError(404, "승인 요청을 찾을 수 없습니다.");
  if (a.status !== "PENDING") throw new HttpError(409, "이미 처리된 요청입니다.");
  if (a.requested_by === user.name) throw new HttpError(403, "본인 요청은 직접 승인할 수 없습니다.");
  if (!approve) {
    run("UPDATE approvals SET status='REJECTED', decided_by=?, decided_at=datetime('now'), comment=?, updated_at=datetime('now') WHERE id=?", user.name, comment ?? null, approvalId);
    audit(user, "APPROVAL_REJECT", a.entity_type, a.entity_id, null, null, comment ?? null);
    return { status: "REJECTED" };
  }
  return tx(() => {
    const before = get(`SELECT * FROM ${TABLE[a.entity_type]} WHERE id = ?`, a.entity_id);
    if (!before) throw new HttpError(409, "대상 데이터가 이미 삭제되었습니다.");
    if (a.action === "DELETE") {
      run(`DELETE FROM ${TABLE[a.entity_type]} WHERE id = ?`, a.entity_id);
      audit(user, "DELETE", a.entity_type, a.entity_id, before, null, `승인 #${a.id}`);
    } else {
      const patch = JSON.parse(a.payload_json ?? "{}") as Row;
      const def = ENTITIES[a.entity_type];
      const merged = { ...before, ...patch };
      const errs = [...(def.validate?.(merged) ?? []), ...businessChecks(a.entity_type, merged, a.entity_id)];
      if (errs.length) throw new HttpError(422, "현재 데이터 기준으로 검증에 실패하여 승인할 수 없습니다.", errs);
      updateRowRaw(a.entity_type, a.entity_id, patch);
      audit(user, "UPDATE", a.entity_type, a.entity_id, before, patch, `승인 #${a.id}`);
    }
    run("UPDATE approvals SET status='APPROVED', decided_by=?, decided_at=datetime('now'), comment=?, updated_at=datetime('now') WHERE id=?", user.name, comment ?? null, approvalId);
    bumpDataVersion();
    return { status: "APPROVED" };
  });
}
