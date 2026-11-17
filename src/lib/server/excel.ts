import "server-only";
import ExcelJS from "exceljs";
import { ENTITIES, normalizeRow, type EntityName, type FieldDef } from "../entities";
import { get, tx, bumpDataVersion, type Row } from "./db";
import { listRows, prepareCreate, createRow, updateRow } from "./repo";
import { audit } from "./audit";
import type { SessionUser } from "../types";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12263F" } };

function displayValue(f: FieldDef, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (f.type === "select" && f.options) return f.options[String(v)] ?? v;
  if (f.type === "bool") return Number(v) ? "예" : "아니오";
  return v;
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = HEADER_FILL;
  r.alignment = { vertical: "middle", horizontal: "center" };
  r.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export function applyNumFmt(ws: ExcelJS.Worksheet, fields: FieldDef[]) {
  fields.forEach((f, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(12, Math.min(40, f.label.length * 2 + 4));
    if (f.type === "money" || f.type === "int") col.numFmt = "#,##0";
    if (f.type === "rate" || f.type === "area" || f.type === "number") col.numFmt = "#,##0.00";
  });
}

export function addMetaSheet(wb: ExcelJS.Workbook, meta: Record<string, string>) {
  const ws = wb.addWorksheet("정보");
  ws.columns = [
    { header: "항목", key: "k", width: 20 },
    { header: "내용", key: "v", width: 70 },
  ];
  for (const [k, v] of Object.entries(meta)) ws.addRow({ k, v });
  styleHeader(ws);
}

export async function exportEntity(user: SessionUser, name: EntityName, baseDate: string, dataVersion: number) {
  const def = ENTITIES[name];
  const rows = listRows(user, name);
  const wb = new ExcelJS.Workbook();
  wb.creator = "A-D PROJECT";
  const ws = wb.addWorksheet(def.label.replace(/[\\/*?:[\]]/g, ""));
  ws.addRow(def.fields.map((f) => f.label));
  for (const r of rows) ws.addRow(def.fields.map((f) => displayValue(f, r[f.key])));
  styleHeader(ws);
  applyNumFmt(ws, def.fields);
  addMetaSheet(wb, {
    시스템: "A-D PROJECT — 준공 후 복합개발사업 통합 운영관리 시스템",
    데이터: def.label,
    기준일: baseDate,
    "데이터 버전": String(dataVersion),
    출력자: `${user.name} (${user.role})`,
    출력일시: new Date().toISOString().replace("T", " ").slice(0, 19),
    비고: "예시 데이터 포함 · 개인정보는 권한에 따라 마스킹됨 · 내부 관리용",
  });
  audit(user, "EXPORT", name, null, null, null, `${rows.length}건 Excel 다운로드`);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function templateEntity(name: EntityName) {
  const def = ENTITIES[name];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("입력");
  const fields = def.fields.filter((f) => !f.readonly || (f.key === "id" && !def.idPrefix));
  ws.addRow(fields.map((f) => f.label));
  styleHeader(ws);
  applyNumFmt(ws, fields);
  const guide = wb.addWorksheet("작성안내");
  guide.columns = [
    { header: "항목", key: "label", width: 22 },
    { header: "필드키", key: "key", width: 22 },
    { header: "형식", key: "type", width: 12 },
    { header: "필수", key: "req", width: 8 },
    { header: "허용값 / 설명", key: "desc", width: 80 },
  ];
  for (const f of fields)
    guide.addRow({
      label: f.label,
      key: f.key,
      type: f.type,
      req: f.required ? "필수" : "",
      desc: [f.options ? Object.values(f.options).join(" / ") : "", f.help ?? "", f.type === "date" ? "YYYY-MM-DD" : f.type === "month" ? "YYYY-MM" : ""].filter(Boolean).join(" · "),
    });
  styleHeader(guide);
  guide.addRow({});
  guide.addRow({ label: "ID 처리", desc: def.idPrefix ? "ID 열을 비우면 신규 등록(자동 채번), 기존 ID를 입력하면 해당 건 수정" : "자산 ID가 이미 있으면 수정, 없으면 신규 등록" });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface ImportReport {
  entity: EntityName;
  total: number;
  inserts: number;
  updates: number;
  errorRows: { row: number; id?: string; messages: string[] }[];
  committed: boolean;
  pendingApprovals: number;
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("text" in v) return (v as { text: string }).text;
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
  }
  return v;
}

export async function importEntity(user: SessionUser, name: EntityName, file: ArrayBuffer, commit: boolean): Promise<ImportReport> {
  const def = ENTITIES[name];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("시트가 없습니다.");
  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((v) => String(cellValue(v) ?? "").trim());
  const colField = header.map((h) => def.fields.find((f) => f.label === h || f.key === h) ?? null);
  const report: ImportReport = { entity: name, total: 0, inserts: 0, updates: 0, errorRows: [], committed: false, pendingApprovals: 0 };
  if (!colField.some(Boolean)) {
    report.errorRows.push({ row: 1, messages: ["헤더(1행)에서 인식 가능한 항목이 없습니다. 템플릿을 사용하세요."] });
    return report;
  }
  const unknown = header.filter((h, i) => h && !colField[i]);
  const parsed: { rowNo: number; data: Row; existing: boolean }[] = [];
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  ws.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const data: Row = {};
    let any = false;
    colField.forEach((f, i) => {
      if (!f) return;
      const v = cellValue(row.getCell(i + 1).value);
      if (v !== null && v !== "") any = true;
      data[f.key] = v;
    });
    if (!any) return;
    report.total++;
    const msgs: string[] = [];
    const id = data.id ? String(data.id).trim() : "";
    const existing = !!id && !!get(`SELECT 1 FROM ${name} WHERE id = ?`, id);
    if (id) {
      if (seenIds.has(id)) msgs.push(`파일 내 ID 중복: ${id}`);
      seenIds.add(id);
    }
    if (def.idPrefix && id && !existing) msgs.push(`존재하지 않는 ID입니다: ${id} (신규 등록은 ID를 비워두세요)`);
    if (existing) {
      const [, errs] = normalizeRow(def, data, { partial: true });
      msgs.push(...errs);
    } else {
      const { errors, row: norm } = prepareCreate(user, name, data);
      msgs.push(...errors);
      if (name === "payments") {
        const k = `${norm.contract_id}|${norm.pay_type}|${norm.amount}|${norm.paid_date}`;
        if (seenKeys.has(k)) msgs.push("파일 내 동일 수납내역 중복");
        seenKeys.add(k);
      }
    }
    if (msgs.length) report.errorRows.push({ row: rowNo, id: id || undefined, messages: msgs });
    else parsed.push({ rowNo, data, existing });
  });
  if (unknown.length) report.errorRows.unshift({ row: 1, messages: [`인식하지 못한 열(무시됨): ${unknown.join(", ")}`] });
  report.inserts = parsed.filter((p) => !p.existing).length;
  report.updates = parsed.filter((p) => p.existing).length;
  const blocking = report.errorRows.filter((e) => e.row !== 1 || !e.messages[0].startsWith("인식하지 못한"));
  if (!commit || blocking.length) return report;

  tx(() => {
    for (const p of parsed) {
      if (p.existing) {
        const { id, ...rest } = p.data;
        const r = updateRow(user, name, String(id), rest, "Excel 업로드");
        if (r.status === "PENDING") report.pendingApprovals++;
      } else {
        const { id, ...rest } = p.data;
        createRow(user, name, def.idPrefix ? rest : { id, ...rest }, { bulk: true });
      }
    }
    bumpDataVersion();
    audit(user, "IMPORT", name, null, null, null, `신규 ${report.inserts} · 수정 ${report.updates} · 승인대기 ${report.pendingApprovals}`);
  });
  report.committed = true;
  return report;
}
