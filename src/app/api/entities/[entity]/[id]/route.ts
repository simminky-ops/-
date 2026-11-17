import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { deleteRow, getRow, updateRow } from "@/lib/server/repo";
import { ENTITIES, isEntityName } from "@/lib/entities";

type Ctx = { params: Promise<{ entity: string; id: string }> };

async function resolve(ctx: Ctx) {
  const { entity, id } = await ctx.params;
  if (!isEntityName(entity)) throw new HttpError(404, "알 수 없는 데이터 유형입니다.");
  return { entity, id: decodeURIComponent(id) };
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { entity, id } = await resolve(ctx);
    const user = await requireApi(ENTITIES[entity].module);
    return Response.json({ row: getRow(user, entity, id) });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { entity, id } = await resolve(ctx);
    const user = await requireApi(ENTITIES[entity].module, true);
    const body = (await req.json()) as { data?: Record<string, unknown>; reason?: string };
    return Response.json(updateRow(user, entity, id, body.data ?? {}, body.reason));
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { entity, id } = await resolve(ctx);
    const user = await requireApi(ENTITIES[entity].module, true);
    const reason = new URL(req.url).searchParams.get("reason") ?? undefined;
    return Response.json(deleteRow(user, entity, id, reason));
  } catch (e) {
    return apiError(e);
  }
}
