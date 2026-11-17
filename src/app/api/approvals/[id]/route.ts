import { apiError, requireApi } from "@/lib/server/auth";
import { decideApproval } from "@/lib/server/repo";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireApi("approvals", true);
    const body = (await req.json()) as { approve: boolean; comment?: string };
    return Response.json(decideApproval(user, Number(id), !!body.approve, body.comment));
  } catch (e) {
    return apiError(e);
  }
}
