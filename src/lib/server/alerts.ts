import "server-only";
// 업무기한·리스크 알림 (데이터에서 실시간 산출 — 별도 저장 없음)
import type { Snapshot } from "./snapshot";
import { all } from "./db";
import { addDays, daysBetween } from "../format";
import { canRead, type Module } from "../rbac";
import type { SessionUser } from "../types";

export interface Alert {
  level: "critical" | "serious" | "warning";
  category: string;
  title: string;
  due: string | null;
  dday: number | null;
  link: string;
  module: Module;
}

export function buildAlerts(snap: Snapshot, user: SessionUser): Alert[] {
  const { data, values } = snap;
  const asOf = data.settings.base_date;
  const out: Alert[] = [];
  const dd = (d: string) => daysBetween(asOf, d);

  for (const c of values.calcs) {
    if (!c.activeAsOf) continue;
    const k = c.contract;
    const unpaid = c.overduePrincipal + c.deferralOutstanding;
    if (k.middle_loan_maturity && unpaid > 0 && k.middle_loan_maturity <= addDays(asOf, 60)) {
      out.push({ level: dd(k.middle_loan_maturity) <= 30 ? "critical" : "serious", category: "대위변제 위험", title: `${k.asset_id} 중도금대출 만기 도래 · 잔금 미납`, due: k.middle_loan_maturity, dday: dd(k.middle_loan_maturity), link: `/assets/${k.asset_id}`, module: "receivables" });
    }
    if (c.overdueDays > 90) out.push({ level: c.overdueDays > 180 ? "critical" : "serious", category: "장기 미납", title: `${k.asset_id} 잔금 ${c.overdueDays}일 연체`, due: null, dday: null, link: `/assets/${k.asset_id}`, module: "receivables" });
    for (const d of c.deferrals) {
      if (d.status === "ACTIVE" && d.maturity_date <= addDays(asOf, 45) && c.deferralOutstanding > 0)
        out.push({ level: d.maturity_date < asOf ? "critical" : "warning", category: "유예 만기", title: `${k.asset_id} 잔금유예 만기 (${d.id})`, due: d.maturity_date, dday: dd(d.maturity_date), link: `/assets/${k.asset_id}`, module: "receivables" });
    }
  }
  for (const r of values.d.rows) {
    if (r.remaining > 0 && r.debt.due_date && r.debt.due_date <= addDays(asOf, 45))
      out.push({ level: r.debt.due_date < asOf ? "critical" : "serious", category: "채무 납부기한", title: `${r.debt.id} ${r.debt.creditor} 납부기한`, due: r.debt.due_date, dday: dd(r.debt.due_date), link: "/cashflow?tab=debts", module: "cashflow" });
  }
  for (const r of data.risks) {
    if (r.status === "CLOSED" || !r.next_action_date) continue;
    if (r.confidential && !canRead(user.role, "risks_confidential")) continue;
    if (r.next_action_date <= addDays(asOf, 14))
      out.push({ level: r.next_action_date < asOf ? "critical" : r.priority === "HIGH" ? "serious" : "warning", category: "리스크 조치", title: `${r.id} ${r.title}`, due: r.next_action_date, dday: dd(r.next_action_date), link: "/risks", module: "risks" });
  }
  for (const l of data.leases) {
    if (["CONTRACTED", "OPEN"].includes(l.negotiation_status) && l.end_date && l.end_date <= addDays(asOf, 180))
      out.push({ level: "warning", category: "임대 만기", title: `${l.asset_id} 임대차 만기 도래`, due: l.end_date, dday: dd(l.end_date), link: "/leasing", module: "leasing" });
    if (l.negotiation_status === "CONTRACTED" && l.move_in_date && l.move_in_date < asOf && !l.open_date)
      out.push({ level: "warning", category: "입점 지연", title: `${l.asset_id} 입점예정일 경과·영업 미개시`, due: l.move_in_date, dday: dd(l.move_in_date), link: "/leasing", module: "leasing" });
  }
  for (const i of data.issues) {
    if (i.stage !== "DONE" && i.planned_date && i.planned_date < asOf)
      out.push({ level: "warning", category: "하자보수 지연", title: `${i.id} ${i.asset_id ?? "공용부"} 보수예정일 경과`, due: i.planned_date, dday: dd(i.planned_date), link: "/operations", module: "operations" });
  }
  for (const m of snap.cf.BASE.months.filter((x) => x.kind === "FORECAST" && x.ending < 0).slice(0, 1)) {
    out.push({ level: "critical", category: "자금 부족", title: `기준 시나리오 ${m.month} 기말현금 부족 예상`, due: `${m.month}-01`, dday: dd(`${m.month}-01`), link: "/cashflow", module: "cashflow" });
  }
  const pending = all<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE status = 'PENDING'")[0]?.n ?? 0;
  if (pending > 0) out.push({ level: "warning", category: "승인 대기", title: `승인 대기 ${pending}건`, due: null, dday: null, link: "/approvals", module: "approvals" });

  const rank = { critical: 0, serious: 1, warning: 2 };
  return out
    .filter((a) => canRead(user.role, a.module))
    .sort((a, b) => rank[a.level] - rank[b.level] || (a.dday ?? 9999) - (b.dday ?? 9999));
}
