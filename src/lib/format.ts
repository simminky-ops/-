// 숫자·금액·날짜 표시 유틸 (원/만원/억원 단위 전환 지원)

export type MoneyUnit = "WON" | "MAN" | "EOK";

export const UNIT_LABEL: Record<MoneyUnit, string> = { WON: "원", MAN: "만원", EOK: "억원" };
const UNIT_DIV: Record<MoneyUnit, number> = { WON: 1, MAN: 1e4, EOK: 1e8 };

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return v.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtMoney(v: number | null | undefined, unit: MoneyUnit = "EOK", withUnit = true): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  const digits = unit === "EOK" ? 1 : 0;
  const s = fmtNum(v / UNIT_DIV[unit], digits);
  return withUnit ? `${s}${UNIT_LABEL[unit]}` : s;
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return "-";
  return `${fmtNum(v, digits)}%`;
}

export function fmtArea(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  return `${fmtNum(v, 2)}㎡`;
}

/** YYYY-MM-DD 로 통일 */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return "-";
  return v.slice(0, 10);
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "-";
  return v.replace("T", " ").slice(0, 16);
}

// ---------- 날짜 계산 (UTC 기반, 시간대 영향 제거) ----------
export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

export function monthOf(s: string): string {
  return s.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function monthDiff(from: string, to: string): number {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function monthRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

export function endOfMonth(month: string): string {
  const next = parseDate(`${addMonths(month, 1)}-01`);
  next.setUTCDate(0);
  return toISODate(next);
}

export function quarterOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

export function addMonthsToDate(date: string, n: number): string {
  const d = parseDate(date);
  const day = d.getUTCDate();
  const target = addMonths(monthOf(date), n);
  const last = Number(endOfMonth(target).slice(8, 10));
  return `${target}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function sum<T>(arr: T[], f: (x: T) => number): number {
  let s = 0;
  for (const x of arr) s += f(x) || 0;
  return s;
}

export function round(v: number, digits = 0): number {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

export function ratio(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}
