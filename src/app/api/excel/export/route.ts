import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { exportEntity } from "@/lib/server/excel";
import { ENTITIES, isEntityName } from "@/lib/entities";
import { getSetting } from "@/lib/server/db";

export async function GET(req: Request) {
  try {
    const entity = new URL(req.url).searchParams.get("entity") ?? "";
    if (!isEntityName(entity)) throw new HttpError(404, "알 수 없는 데이터 유형입니다.");
    const user = await requireApi(ENTITIES[entity].module);
    const buf = await exportEntity(user, entity, getSetting("base_date", ""), getSetting("data_version", 0));
    const fname = encodeURIComponent(`A-D_${ENTITIES[entity].label}_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
