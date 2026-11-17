import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { templateEntity } from "@/lib/server/excel";
import { ENTITIES, isEntityName } from "@/lib/entities";

export async function GET(req: Request) {
  try {
    const entity = new URL(req.url).searchParams.get("entity") ?? "";
    if (!isEntityName(entity)) throw new HttpError(404, "알 수 없는 데이터 유형입니다.");
    await requireApi(ENTITIES[entity].module);
    const buf = await templateEntity(entity);
    const fname = encodeURIComponent(`A-D_업로드양식_${ENTITIES[entity].label}.xlsx`);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${fname}`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
