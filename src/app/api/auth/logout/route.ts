import { apiError, getSessionUser, logout } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";

export async function POST() {
  try {
    const u = await getSessionUser();
    await logout();
    if (u) audit(u, "LOGOUT", "users", u.username, null, null, null);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
