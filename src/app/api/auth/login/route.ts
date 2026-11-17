import { apiError, login } from "@/lib/server/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    if (!body.username || !body.password) return Response.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    const user = await login(body.username.trim(), body.password);
    return Response.json({ user: { name: user.name, role: user.role } });
  } catch (e) {
    return apiError(e);
  }
}
