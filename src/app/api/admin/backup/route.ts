import fs from "node:fs";
import { apiError, requireApi } from "@/lib/server/auth";
import { backupPath, createBackup, listBackups } from "@/lib/server/backup";
import { audit } from "@/lib/server/audit";

export async function GET(req: Request) {
  try {
    const user = await requireApi("admin");
    const name = new URL(req.url).searchParams.get("download");
    if (name) {
      const buf = fs.readFileSync(backupPath(name));
      audit(user, "BACKUP_DOWNLOAD", "backup", name, null, null, null);
      return new Response(new Uint8Array(buf), {
        headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"` },
      });
    }
    return Response.json({ backups: listBackups() });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST() {
  try {
    const user = await requireApi("admin", true);
    const name = createBackup("manual");
    audit(user, "BACKUP", "backup", name, null, null, null);
    return Response.json({ name });
  } catch (e) {
    return apiError(e);
  }
}
