import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { restoreBackup } from "@/lib/server/backup";
import { audit } from "@/lib/server/audit";

export async function POST(req: Request) {
  try {
    const user = await requireApi("admin", true);
    const { name, confirm } = (await req.json()) as { name?: string; confirm?: string };
    if (!name) throw new HttpError(400, "백업 파일을 선택하세요.");
    if (confirm !== "RESTORE") throw new HttpError(400, "확인 문구(RESTORE)를 입력해야 복구됩니다.");
    const safety = restoreBackup(name);
    // 복구 후 새 DB에 감사로그 기록
    audit(user, "RESTORE", "backup", name, null, null, `복구 전 자동백업: ${safety}`);
    return Response.json({ ok: true, safety });
  } catch (e) {
    if (e instanceof Error && !(e instanceof HttpError)) return Response.json({ error: e.message }, { status: 400 });
    return apiError(e);
  }
}
