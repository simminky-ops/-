import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { createRow, listRows } from "@/lib/server/repo";
import { ENTITIES, isEntityName } from "@/lib/entities";

type Ctx = { params: Promise<{ entity: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { entity } = await ctx.params;
    if (!isEntityName(entity)) throw new HttpError(404, "알 수 없는 데이터 유형입니다.");
    const user = await requireApi(ENTITIES[entity].module);
    const url = new URL(req.url);
    const filterKey = url.searchParams.get("by");
    const filterVal = url.searchParams.get("value");
    const def = ENTITIES[entity];
    const where =
      filterKey && filterVal !== null && def.fields.some((f) => f.key === filterKey)
        ? { sql: `${filterKey} = ?`, params: [filterVal] }
        : undefined;
    return Response.json({ rows: listRows(user, entity, where) });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { entity } = await ctx.params;
    if (!isEntityName(entity)) throw new HttpError(404, "알 수 없는 데이터 유형입니다.");
    const user = await requireApi(ENTITIES[entity].module, true);
    const body = (await req.json()) as Record<string, unknown>;
    const row = createRow(user, entity, body);
    return Response.json({ row }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
