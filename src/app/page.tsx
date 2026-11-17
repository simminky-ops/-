import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";

export default async function Home() {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  redirect(u.role === "EXTERNAL" ? "/report" : u.role === "ADMIN" ? "/admin" : "/dashboard");
}
