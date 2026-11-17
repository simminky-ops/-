import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { canWrite } from "@/lib/rbac";
import { AGING_ORDER, agingBucket } from "@/lib/calc/contracts";
import { ENTITIES } from "@/lib/entities";
import { CONTRACT_STATUS_LABEL } from "@/lib/types";
import { addDays, monthOf, sum } from "@/lib/format";
import { Card, Grid, Note, PageHeader, Stat } from "@/components/ui";
import { Money, Pct } from "@/components/money";
import { BarsChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { EntityManager } from "@/components/entity-manager";

const NEG = ENTITIES.receivables.fields.find((f) => f.key === "negotiation_status")!.options!;
const ACT = ENTITIES.collection_actions.fields.find((f) => f.key === "action_type")!.options!;
const AGING_TONE: Record<string, string> = { 정상: "neutral", "1~30일": "warn", "31~90일": "warn", "91~180일": "bad", "180일 초과": "bad" };

export default async function ReceivablesPage() {
  const user = await requirePage("receivables");
  const snap = getSnapshot();
  const { data, values } = snap;
  const asOf = data.settings.base_date;
  const c = values.c;
  const recBy = new Map(data.receivables.filter((r) => r.status === "OPEN").map((r) => [r.contract_id, r]));

  const open = values.calcs.filter((x) => x.activeAsOf && (x.balanceUnpaid > 0 || x.deferralOutstanding > 0 || x.overduePrincipal > 0));
  const rows = open
    .map((x) => {
      const k = x.contract;
      const rec = recBy.get(k.id);
      const unpaid = x.overduePrincipal + x.deferralOutstanding;
      const subrogation = !!k.middle_loan_maturity && unpaid > 0 && k.middle_loan_maturity <= addDays(asOf, 60);
      const flags = [subrogation ? "대위변제 위험" : "", x.overdueDays > 90 ? "장기미납" : ""].filter(Boolean).join(" · ");
      return {
        id: k.id,
        asset_id: k.asset_id,
        is_resale: k.is_resale,
        due: k.balance_due_date,
        billed: x.balanceBilled,
        collected: x.balanceCollected,
        unpaid: x.balanceUnpaid,
        overdue: x.overduePrincipal,
        overdue_days: x.overdueDays,
        aging: agingBucket(x.overdueDays),
        deferral: x.deferralOutstanding,
        deferral_maturity: x.deferrals.find((d) => d.status === "ACTIVE")?.maturity_date ?? null,
        rate: k.late_fee_rate,
        late_fee: x.lateFee.fee,
        late_fee_unpaid: x.lateFeeUnpaid,
        middle_interest: k.middle_loan_interest,
        loan_maturity: k.middle_loan_maturity,
        notices: rec?.notice_count ?? 0,
        negotiation: rec?.negotiation_status ?? "NONE",
        expected_date: rec?.expected_date ?? null,
        flags,
      };
    })
    .sort((a, b) => b.overdue_days - a.overdue_days || b.unpaid - a.unpaid);

  const aging = AGING_ORDER.map((b) => {
    const r = rows.filter((x) => x.aging === b);
    return { bucket: b, amount: sum(r, (x) => (b === "정상" ? x.deferral : x.overdue)), count: r.length };
  });
  const subroRows = rows.filter((r) => r.flags.includes("대위변제"));
  const longRows = rows.filter((r) => r.overdue_days > 90);

  // 회수예정표: 납부약정(회수예정) + 유예 만기 (월별)
  const sched = new Map<string, { month: string; promised: number; deferral: number; count: number }>();
  const addS = (m: string, k: "promised" | "deferral", v: number) => {
    const r = sched.get(m) ?? { month: m, promised: 0, deferral: 0, count: 0 };
    r[k] += v;
    r.count++;
    sched.set(m, r);
  };
  const openIds = new Map(open.map((x) => [x.contract.id, x]));
  for (const r of data.receivables) {
    const x = openIds.get(r.contract_id);
    if (r.status !== "OPEN" || !x || !r.expected_date || r.expected_amount <= 0) continue;
    const nonDeferred = Math.max(0, x.balanceUnpaid - x.deferralOutstanding);
    const amt = Math.min(r.expected_amount, nonDeferred);
    if (amt > 0) addS(monthOf(r.expected_date), "promised", amt);
  }
  for (const x of open) {
    for (const d of x.deferrals) {
      if (d.status !== "ACTIVE") continue;
      const paid = sum(data.payments.filter((p) => p.deferral_id === d.id && p.paid_date <= asOf), (p) => p.amount);
      const out = d.deferred_amount - paid;
      if (out > 0) addS(monthOf(d.maturity_date), "deferral", out);
    }
  }
  const schedule = [...sched.values()].sort((a, b) => a.month.localeCompare(b.month)).map((s) => ({ ...s, id: s.month, total: s.promised + s.deferral }));

  const actions = [...data.actions]
    .sort((a, b) => b.action_date.localeCompare(a.action_date))
    .map((a) => ({ ...a, asset_id: data.receivables.find((r) => r.id === a.receivable_id)?.asset_id ?? null }));

  const terminated = data.contracts
    .filter((k) => k.status === "TERMINATED")
    .map((k) => {
      const pays = data.payments.filter((p) => p.contract_id === k.id && p.paid_date <= asOf);
      const paid = sum(pays.filter((p) => ["DEPOSIT", "MIDDLE", "BALANCE", "DEFERRAL"].includes(p.pay_type)), (p) => p.amount);
      const refund = -sum(pays.filter((p) => p.pay_type === "REFUND"), (p) => p.amount);
      const resale = data.contracts.find((r) => r.prev_contract_id === k.id);
      return {
        id: k.id,
        asset_id: k.asset_id,
        terminated_at: k.terminated_at,
        reason: k.termination_reason,
        supply: k.supply_price,
        paid,
        refund,
        retained: paid - refund,
        resale_id: resale?.id ?? "",
        resale_status: resale ? CONTRACT_STATUS_LABEL[resale.status] : "미재판매",
      };
    })
    .sort((a, b) => String(b.terminated_at).localeCompare(String(a.terminated_at)));

  return (
    <div className="space-y-5">
      <PageHeader
        code="B05"
        title="미수금 및 채권관리"
        desc="준공 이후 분양대금 회수와 금융 리스크 방어. 미수금·연체료·연체기간은 계약·수납·유예 원장에서 자동 집계되며, 회수 실적과 회수예정은 B07 현금흐름에 자동 연동됩니다."
      />
      <Grid cols={6}>
        <Stat label="잔금 청구 확정액" value={<Money v={c.billed} />} sub="납부기한 도래 · 유효계약" />
        <Stat label="잔금 회수율" value={<Pct v={c.collectionRate} />} sub={<>수납 <Money v={c.collected} /></>} tone={c.collectionRate >= 90 ? "good" : "warn"} />
        <Stat label="잔금 미수금" value={<Money v={c.unpaid} />} sub={<>미수금 비율 <Pct v={c.receivableRate} /></>} tone="bad" />
        <Stat label="연체원금" value={<Money v={c.overdue} />} sub={`${c.overdueCount}건 · 장기(90일↑) ${longRows.length}건`} tone="bad" />
        <Stat label="유예 잔액(만기 전)" value={<Money v={c.deferred} />} sub={`${c.deferredCount}건`} tone="warn" />
        <Stat label="연체료 발생 / 미납" value={<Money v={c.lateFee} />} sub={<>미납 <Money v={c.lateFeeUnpaid} /></>} />
      </Grid>

      {subroRows.length > 0 && (
        <Note tone="warn">
          ■ <b>대위변제 위험 {subroRows.length}건</b> — 중도금대출 만기가 60일 이내 도래하나 잔금(연체·유예)이 미납인 계약입니다. 금융기관 A와 만기연장·상환 협의 또는 잔금 회수 조치가 필요합니다:{" "}
          {subroRows.slice(0, 12).map((r) => r.asset_id).join(", ")}
          {subroRows.length > 12 ? " 외" : ""}
        </Note>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="연체기간별 채권 분류" sub="정상 구간 금액 = 만기 전 유예 잔액">
          <BarsChart data={aging} x="bucket" kind="money" series={[{ key: "amount", label: "금액" }]} height={220} />
          <table className="tbl mt-2">
            <thead>
              <tr>
                <th>구간</th>
                <th className="r">건수</th>
                <th className="r">금액</th>
              </tr>
            </thead>
            <tbody>
              {aging.map((a) => (
                <tr key={a.bucket}>
                  <td>{a.bucket}</td>
                  <td className="r num">{a.count}</td>
                  <td className="r">
                    <Money v={a.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="회수예정표" sub="납부약정(회수예정) + 유예금 만기 · 월별" className="xl:col-span-2">
          <BarsChart
            data={schedule}
            x="month"
            kind="money"
            series={[
              { key: "promised", label: "납부약정", stack: "a" },
              { key: "deferral", label: "유예 만기", stack: "a" },
            ]}
            height={220}
          />
          <DataTable
            rows={schedule}
            dense
            maxHeight={200}
            cols={[
              { key: "month", label: "월" },
              { key: "count", label: "건수", kind: "num" },
              { key: "promised", label: "납부약정", kind: "money", sum: true },
              { key: "deferral", label: "유예 만기", kind: "money", sum: true },
              { key: "total", label: "합계", kind: "money", sum: true },
            ]}
          />
        </Card>
      </div>

      <Card title="계약별 채권 현황" sub="연체료 = 연체원금 × 계약별 연이율 × 실제 일수 ÷ 365 (기산일: 납부기한 다음날, 만기 전 유예금 제외)">
        <DataTable
          rows={rows}
          filters={[
            { key: "aging", label: "연체구간", options: Object.fromEntries(AGING_ORDER.map((a) => [a, a])) },
            { key: "negotiation", label: "회수협의", options: NEG },
          ]}
          dense
          maxHeight={520}
          cols={[
            { key: "id", label: "계약 ID" },
            { key: "asset_id", label: "자산 ID", link: "/assets/{asset_id}" },
            { key: "is_resale", label: "재판매", kind: "bool" },
            { key: "due", label: "납부기한", kind: "date" },
            { key: "billed", label: "청구액", kind: "money", sum: true },
            { key: "collected", label: "납부액", kind: "money", sum: true },
            { key: "unpaid", label: "미수(유예포함)", kind: "money", sum: true },
            { key: "overdue", label: "연체원금", kind: "money", sum: true },
            { key: "overdue_days", label: "연체일수", kind: "num" },
            { key: "aging", label: "연체구간", tone: AGING_TONE },
            { key: "deferral", label: "유예잔액", kind: "money", sum: true },
            { key: "deferral_maturity", label: "유예만기", kind: "date" },
            { key: "rate", label: "연체이율", kind: "pct" },
            { key: "late_fee", label: "연체료", kind: "money", sum: true },
            { key: "late_fee_unpaid", label: "연체료 미납", kind: "money", sum: true },
            { key: "middle_interest", label: "대납이자", kind: "money", sum: true },
            { key: "loan_maturity", label: "중도금대출 만기", kind: "date" },
            { key: "notices", label: "최고장", kind: "num" },
            { key: "negotiation", label: "회수협의", map: NEG },
            { key: "expected_date", label: "회수예정일", kind: "date" },
            { key: "flags", label: "경고" },
          ]}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="최고장 발송·회수조치 이력">
          <DataTable
            rows={actions}
            dense
            maxHeight={320}
            filters={[{ key: "action_type", label: "조치유형", options: ACT }]}
            cols={[
              { key: "action_date", label: "조치일", kind: "date" },
              { key: "receivable_id", label: "채권관리 ID" },
              { key: "asset_id", label: "자산 ID", link: "/assets/{asset_id}" },
              { key: "action_type", label: "유형", map: ACT },
              { key: "round", label: "차수", kind: "num" },
              { key: "note", label: "내용" },
            ]}
          />
        </Card>
        <Card title="계약해지 및 정산 현황" sub="해지 계약 · 환급 · 재판매 연결">
          <DataTable
            rows={terminated}
            dense
            maxHeight={320}
            cols={[
              { key: "id", label: "해지계약" },
              { key: "asset_id", label: "자산 ID", link: "/assets/{asset_id}" },
              { key: "terminated_at", label: "해지일", kind: "date" },
              { key: "reason", label: "사유" },
              { key: "paid", label: "기납부", kind: "money", sum: true },
              { key: "refund", label: "환급", kind: "money", sum: true },
              { key: "retained", label: "위약금 등 귀속", kind: "money", sum: true },
              { key: "resale_id", label: "재판매 계약" },
              { key: "resale_status", label: "재판매 상태" },
            ]}
          />
        </Card>
      </div>

      <Card title="채권 관리카드 (최고장·협의·납부약정)" sub="연체 계약별 회수활동 기록. 회수예정액·예정일은 현금흐름 회수 일정에 반영됩니다.">
        <EntityManager entity="receivables" canWrite={canWrite(user.role, "receivables")} filters={["negotiation_status", "status"]} />
      </Card>
      <Card title="회수조치 등록">
        <EntityManager entity="collection_actions" canWrite={canWrite(user.role, "receivables")} compact />
      </Card>
      <Note>
        잔금회수율 = 잔금 수납액(잔금+유예금 회수) ÷ 잔금 청구 확정액 × 100, 미수금 비율 = 잔금 미수원금 ÷ 잔금 청구 확정액 × 100. 수납내역을 등록하면 미수금·연체료·KPI·현금흐름(B07)이 자동으로 다시 계산됩니다. 법률조치 진행 건은 B09에서 함께 관리합니다.
      </Note>
    </div>
  );
}
