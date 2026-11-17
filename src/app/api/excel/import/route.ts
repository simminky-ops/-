import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { importEntity } from "@/lib/server/excel";
import { ENTITIES, isEntityName } from "@/lib/entities";
import { canWrite } from "@/lib/rbac";
import { invalidateSnapshot } from "@/lib/server/snapshot";

const MAX = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const entity = String(form.get("entity") ?? "");
    const commit = form.get("commit") === "1";
    if (!isEntityName(entity)) throw new HttpError(404, "알 수 없는 데이터 유형입니다.");
    const user = await requireApi(ENTITIES[entity].module, commit);
    if (!canWrite(user.role, ENTITIES[entity].module)) throw new HttpError(403, "업로드(쓰기) 권한이 없습니다.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "파일을 선택하세요.");
    if (file.size > MAX) throw new HttpError(413, "파일은 10MB 이하만 업로드할 수 있습니다.");
    if (!/\.xlsx$/i.test(file.name)) throw new HttpError(415, ".xlsx 파일만 업로드할 수 있습니다.");
    const report = await importEntity(user, entity, await file.arrayBuffer(), commit);
    if (report.committed) invalidateSnapshot();
    return Response.json(report);
  } catch (e) {
    return apiError(e);
  }
}
