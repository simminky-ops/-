import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { PageHeader } from "@/components/ui";
import { canWrite } from "@/lib/rbac";
import { CashflowWorkbench } from "@/components/b07-cashflow";
import { DEBT_TYPE_LABEL } from "@/lib/types";

export default async function CashflowPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePage("cashflow");
  const { tab } = await searchParams;
  const snap = getSnapshot();
  const st = snap.data.settings;
  const debtRows = snap.values.d.rows.map((r) => {
    const end = snap.cf.BASE.debtEnd.find((x) => x.id === r.debt.id);
    // 기준 시나리오 상환완료 예상월
    let payoff: string | null = null;
    if (end && end.end <= 0) {
      for (const m of snap.cf.BASE.months) {
        if (m.details.some((d) => d.label.startsWith(`${r.debt.id} `) && d.amount < 0 && !d.label.includes("이자"))) payoff = m.month;
      }
    }
    return {
      id: r.debt.id,
      debt_type: r.debt.debt_type,
      type_label: DEBT_TYPE_LABEL[r.debt.debt_type],
      creditor: r.debt.creditor,
      principal: r.debt.principal,
      interest_penalty: r.debt.interest_penalty,
      repaid: r.repaid,
      remaining: r.remaining,
      planned: r.plannedFuture,
      unplanned: r.unplanned,
      due_date: r.debt.due_date,
      installment_status: r.debt.installment_status,
      priority: r.debt.priority,
      overdue: r.overdue ? "연체" : "-",
      negotiator: r.debt.negotiator,
      payoff: payoff ?? (end && end.end > 0 ? "기간 내 미완료" : "-"),
      end_balance: end?.end ?? r.remaining,
    };
  });
  return (
    <div className="space-y-5">
      <PageHeader
        code="B07"
        title="36개월 현금흐름 및 채무상환"
        desc="기초현금 + 현금유입 − 현금유출 = 기말현금 (다음 달 기초현금으로 연결). 기준월 이전은 수납·상환·수기 실적, 기준월부터는 계약·유예·임대·채무계획과 시나리오 가정으로 자동 예측합니다."
      />
      <CashflowWorkbench
        initial={{ CONS: snap.cf.CONS, BASE: snap.cf.BASE, OPT: snap.cf.OPT }}
        feasProfit={{ CONS: snap.feas.CONS.profit, BASE: snap.feas.BASE.profit, OPT: snap.feas.OPT.profit }}
        feasDiscount={{ CONS: snap.feas.CONS.discountLoss, BASE: snap.feas.BASE.discountLoss, OPT: snap.feas.OPT.discountLoss }}
        scenarios={st.scenarios}
        startMonth={st.cashflow_start}
        months={st.cashflow_months}
        openingCash={st.opening_cash}
        openingMonth={st.opening_cash_month}
        minCash={st.min_cash}
        baseDate={st.base_date}
        canEdit={canWrite(user.role, "cashflow")}
        debtRows={debtRows}
        initialTab={tab ?? "flow"}
      />
    </div>
  );
}
