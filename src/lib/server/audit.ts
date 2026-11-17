import "server-only";
import { run } from "./db";
import type { SessionUser } from "../types";

export function audit(
  user: SessionUser | null,
  action: string,
  entityType: string | null,
  entityId: string | null,
  before: unknown,
  after: unknown,
  detail: string | null,
) {
  run(
    "INSERT INTO audit_logs(username, role, action, entity_type, entity_id, before_json, after_json, detail) VALUES(?,?,?,?,?,?,?,?)",
    user?.username ?? "anonymous",
    user?.role ?? null,
    action,
    entityType,
    entityId,
    before === null || before === undefined ? null : JSON.stringify(before),
    after === null || after === undefined ? null : JSON.stringify(after),
    detail,
  );
}
