import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { get, getSetting, run } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { reportMeta } from "@/lib/server/reports";
import { canWrite } from "@/lib/rbac";

// 보고서 버전 관리: 작성(DRAFT) → 제출(SUBMITTED) → 승인/반려(경영진)
export async function POST(req: Request) {
  try {
    const user = await requireApi("reports");
    const b = (await req.json()) as { action: "create" | "submit" | "approve" | "reject"; type?: string; id?: number; comment?: string };
    if (b.action === "create") {
      if (!canWrite(user.role, "reports")) throw new HttpError(403, "보고서 작성 권한이 없습니다.");
      const meta = reportMeta(b.type ?? "");
      if (!meta) throw new HttpError(404, "보고서 유형이 없습니다.");
      run(
        "INSERT INTO report_snapshots(report_type, title, base_date, data_version, author, status) VALUES(?,?,?,?,?, 'DRAFT')",
        meta.type,
        `${meta.title} (${getSetting("base_date", "")})`,
        getSetting("base_date", ""),
        getSetting("data_version", 0),
        user.name,
      );
      audit(user, "REPORT_CREATE", "report", meta.type, null, null, null);
      return Response.json({ ok: true });
    }
    const r = get<{ id: number; status: string; author: string; report_type: string }>("SELECT * FROM report_snapshots WHERE id = ?", b.id);
    if (!r) throw new HttpError(404, "보고서 버전을 찾을 수 없습니다.");
    if (b.action === "submit") {
      if (r.author !== user.name) throw new HttpError(403, "작성자만 제출할 수 있습니다.");
      if (r.status !== "DRAFT" && r.status !== "REJECTED") throw new HttpError(409, "초안·반려 상태만 제출할 수 있습니다.");
      run("UPDATE report_snapshots SET status='SUBMITTED', updated_at=datetime('now') WHERE id=?", r.id);
    } else {
      if (user.role !== "EXECUTIVE") throw new HttpError(403, "승인 권한(경영진)이 없습니다.");
      if (r.status !== "SUBMITTED") throw new HttpError(409, "제출된 보고서만 승인·반려할 수 있습니다.");
      run(
        "UPDATE report_snapshots SET status=?, approved_by=?, approved_at=datetime('now'), comment=?, updated_at=datetime('now') WHERE id=?",
        b.action === "approve" ? "APPROVED" : "REJECTED",
        user.name,
        b.comment ?? null,
        r.id,
      );
    }
    audit(user, `REPORT_${b.action.toUpperCase()}`, "report", r.report_type, null, null, `#${r.id}`);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
