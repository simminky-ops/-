import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { all, get, run, UPLOAD_DIR } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { canWrite } from "@/lib/rbac";
import { canSeeDoc, moduleOf } from "@/lib/server/docs";

const ALLOWED = /\.(pdf|jpg|jpeg|png|gif|webp|xlsx|xls|docx|doc|hwp|hwpx|txt|zip)$/i;
const MAX = 20 * 1024 * 1024;



export async function GET(req: Request) {
  try {
    const user = await requireApi();
    const url = new URL(req.url);
    const et = url.searchParams.get("entity_type");
    const eid = url.searchParams.get("entity_id");
    const rows = all<{ entity_type: string | null; confidential: number } & Record<string, unknown>>(
      `SELECT id, entity_type, entity_id, asset_id, category, filename, mime, size, confidential, uploaded_by, created_at FROM documents ${et ? "WHERE entity_type = ? AND entity_id = ?" : ""} ORDER BY created_at DESC`,
      ...(et ? [et, eid ?? ""] : []),
    );
    return Response.json({ rows: rows.filter((r) => canSeeDoc(user, r)) });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const entityType = (form.get("entity_type") as string) || null;
    const entityId = (form.get("entity_id") as string) || null;
    const confidential = form.get("confidential") === "1" ? 1 : 0;
    const user = await requireApi(moduleOf(entityType), true);
    if (!canWrite(user.role, moduleOf(entityType))) throw new HttpError(403, "첨부 권한이 없습니다.");
    if (confidential && !canWrite(user.role, "risks_confidential")) throw new HttpError(403, "기밀 문서 등록 권한이 없습니다.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "파일을 선택하세요.");
    if (file.size > MAX) throw new HttpError(413, "파일은 20MB 이하만 업로드할 수 있습니다.");
    if (!ALLOWED.test(file.name)) throw new HttpError(415, "허용되지 않는 파일 형식입니다.");
    const n = (get<{ n: number }>("SELECT COUNT(*) AS n FROM documents")?.n ?? 0) + 1;
    const id = `DOC-${String(n).padStart(5, "0")}-${crypto.randomBytes(2).toString("hex")}`;
    const stored = `${crypto.randomUUID()}${path.extname(file.name).toLowerCase()}`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));
    const assetId = entityType === "assets" ? entityId : (form.get("asset_id") as string) || null;
    run(
      "INSERT INTO documents(id, entity_type, entity_id, asset_id, category, filename, stored_name, mime, size, confidential, uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      id,
      entityType,
      entityId,
      assetId,
      (form.get("category") as string) || "일반",
      file.name.slice(0, 200),
      stored,
      file.type || "application/octet-stream",
      file.size,
      confidential,
      user.name,
    );
    audit(user, "DOC_UPLOAD", entityType, entityId, null, { id, filename: file.name, size: file.size }, null);
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
