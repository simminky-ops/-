import fs from "node:fs";
import path from "node:path";
import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { get, run, UPLOAD_DIR } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { canWrite } from "@/lib/rbac";
import { canSeeDoc, moduleOf } from "@/lib/server/docs";

type Doc = { id: string; entity_type: string | null; entity_id: string | null; filename: string; stored_name: string; mime: string; confidential: number };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireApi();
    const d = get<Doc>("SELECT * FROM documents WHERE id = ?", id);
    if (!d || !canSeeDoc(user, d)) throw new HttpError(404, "문서를 찾을 수 없습니다.");
    const buf = fs.readFileSync(path.join(UPLOAD_DIR, path.basename(d.stored_name)));
    audit(user, "DOC_DOWNLOAD", d.entity_type, d.entity_id, null, null, d.filename);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": d.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireApi();
    const d = get<Doc>("SELECT * FROM documents WHERE id = ?", id);
    if (!d || !canSeeDoc(user, d)) throw new HttpError(404, "문서를 찾을 수 없습니다.");
    if (!canWrite(user.role, moduleOf(d.entity_type))) throw new HttpError(403, "삭제 권한이 없습니다.");
    run("DELETE FROM documents WHERE id = ?", id);
    fs.rmSync(path.join(UPLOAD_DIR, path.basename(d.stored_name)), { force: true });
    audit(user, "DOC_DELETE", d.entity_type, d.entity_id, d, null, null);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
