import ExcelJS from "exceljs";
import { apiError, HttpError, requireApi } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { buildReport, reportMeta } from "@/lib/server/reports";
import { addMetaSheet } from "@/lib/server/excel";
import { audit } from "@/lib/server/audit";
import { get } from "@/lib/server/db";

export async function GET(_req: Request, ctx: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await ctx.params;
    const meta = reportMeta(type);
    if (!meta) throw new HttpError(404, "보고서 유형이 없습니다.");
    const user = await requireApi(meta.module);
    const snap = getSnapshot();
    const doc = buildReport(type, snap, user);
    if (!doc) throw new HttpError(403, "보고서 조회 권한이 없습니다.");
    const approval = get<{ status: string; approved_by: string | null }>(
      "SELECT status, approved_by FROM report_snapshots WHERE report_type = ? ORDER BY id DESC LIMIT 1",
      type,
    );
    const wb = new ExcelJS.Workbook();
    wb.creator = "A-D PROJECT";
    addMetaSheet(wb, {
      보고서: doc.title,
      기준일: snap.data.settings.base_date,
      작성일: new Date().toISOString().slice(0, 10),
      작성자: user.name,
      "데이터 버전": String(snap.version),
      승인상태: approval ? `${approval.status}${approval.approved_by ? ` (${approval.approved_by})` : ""}` : "미제출(초안)",
      비고: "가상의 예시 데이터 · 금액 단위: 원 · 내부 관리용",
    });
    doc.sections.forEach((sec, i) => {
      const ws = wb.addWorksheet(`${i + 1}.${sec.title}`.replace(/[\\/*?:[\]]/g, "").slice(0, 31));
      ws.addRow([sec.title]).font = { bold: true, size: 13 };
      for (const t of sec.text ?? []) ws.addRow([t]);
      if (sec.kpis) {
        ws.addRow([]);
        for (const k of sec.kpis) {
          const r = ws.addRow([k.label, k.value, k.sub ?? ""]);
          if (k.kind === "money") r.getCell(2).numFmt = "#,##0";
          if (k.kind === "pct") r.getCell(2).numFmt = '0.0"%"';
        }
      }
      if (sec.table) {
        ws.addRow([]);
        const h = ws.addRow(sec.table.columns.map((c) => c.label));
        h.font = { bold: true, color: { argb: "FFFFFFFF" } };
        h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12263F" } };
        for (const row of [...sec.table.rows, ...(sec.table.total ? [sec.table.total] : [])]) {
          const r = ws.addRow(row);
          sec.table.columns.forEach((c, ci) => {
            if (c.kind === "money" || c.kind === "num") r.getCell(ci + 1).numFmt = "#,##0";
            if (c.kind === "pct") r.getCell(ci + 1).numFmt = '0.0"%"';
          });
        }
        sec.table.columns.forEach((c, ci) => (ws.getColumn(ci + 1).width = Math.max(12, Math.min(36, c.label.length * 2 + 6))));
      }
      ws.getColumn(1).width = Math.max(ws.getColumn(1).width ?? 12, 28);
    });
    audit(user, "REPORT_EXPORT", "report", type, null, null, "Excel");
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const fname = encodeURIComponent(`A-D_${doc.title}_${snap.data.settings.base_date}.xlsx`);
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
