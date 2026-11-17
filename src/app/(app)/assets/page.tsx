import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { canRead, canWrite } from "@/lib/rbac";
import { LEASE_STATE_LABEL, PAY_STATE_LABEL, SALE_STATE_LABEL } from "@/lib/calc/analytics";
import { CONTRACT_STATUS_LABEL, FACILITY_LABEL } from "@/lib/types";
import { sum } from "@/lib/format";
import { Grid, Note, PageHeader, Stat, Card } from "@/components/ui";
import { Money, Pct } from "@/components/money";
import { AssetsTabs } from "@/components/b02-assets-tabs";
import type { Col, FilterDef } from "@/components/data-table";

const SALE_TONE = { UNSOLD: "bad", CONTRACTED: "info", COMPLETED: "good" };
const PAY_TONE = { NONE: "neutral", NOT_DUE: "neutral", NORMAL: "info", DEFERRED: "warn", OVERDUE: "bad", PAID: "good" };
const LEASE_TONE = { NA: "neutral", VACANT: "bad", NEGOTIATING: "warn", CONTRACTED: "info", OPEN: "good" };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePage("assets");
  const { q } = await searchParams;
  const snap = getSnapshot();
  const views = snap.values.views;
  const s = snap.values.s;
  const c = snap.values.c;

  const rows = views.map((v) => ({
    id: v.id,
    facility_type: v.facility_type,
    floor: v.floor,
    floorKey: String(v.floor),
    exclusive_area: v.exclusive_area,
    contract_area: v.contract_area,
    list_price: v.list_price,
    current_price: v.current_price,
    discount_amount: v.discount_amount,
    discount_rate: v.discount_rate,
    contract_id: v.contract_id,
    contract_date: v.contract_date,
    contract_status: v.contract_status,
    sale_state: v.sale_state,
    pay_state: v.pay_state,
    lease_state: v.lease_state,
    supply_price: v.supply_price,
    deposit_amount: v.deposit_amount,
    middle_amount: v.middle_amount,
    balance_amount: v.balance_amount,
    paid_total: v.paid_total,
    balance_unpaid: v.balance_unpaid,
    deferral_outstanding: v.deferral_outstanding,
    deferral_maturity: v.deferral_maturity,
    late_fee: v.late_fee,
    middle_loan_interest: v.middle_loan_interest,
    middle_loan_maturity: v.middle_loan_maturity,
    terminated_count: v.terminated_count,
    is_resale: v.is_resale,
    sales_manager: v.sales_manager ?? v.manager,
  }));

  const cols: Col[] = [
    { key: "id", label: "자산 ID", link: "/assets/{id}" },
    { key: "facility_type", label: "시설유형", map: FACILITY_LABEL },
    { key: "floor", label: "층", kind: "num" },
    { key: "exclusive_area", label: "전용면적", kind: "area" },
    { key: "contract_area", label: "계약면적", kind: "area" },
    { key: "sale_state", label: "분양상태", map: SALE_STATE_LABEL, tone: SALE_TONE },
    { key: "pay_state", label: "수납상태", map: PAY_STATE_LABEL, tone: PAY_TONE },
    { key: "lease_state", label: "임대상태", map: LEASE_STATE_LABEL, tone: LEASE_TONE },
    { key: "list_price", label: "최초 분양가", kind: "money", sum: true },
    { key: "current_price", label: "현재 분양가", kind: "money", sum: true },
    { key: "discount_amount", label: "할인금액", kind: "money", sum: true },
    { key: "discount_rate", label: "할인율", kind: "pct" },
    { key: "contract_id", label: "계약 ID" },
    { key: "contract_date", label: "계약일", kind: "date" },
    { key: "contract_status", label: "계약상태", map: CONTRACT_STATUS_LABEL },
    { key: "supply_price", label: "공급금액", kind: "money", sum: true },
    { key: "deposit_amount", label: "계약금", kind: "money", sum: true },
    { key: "middle_amount", label: "중도금", kind: "money", sum: true },
    { key: "balance_amount", label: "잔금", kind: "money", sum: true },
    { key: "paid_total", label: "납부완료", kind: "money", sum: true },
    { key: "balance_unpaid", label: "잔금 미납액", kind: "money", sum: true },
    { key: "deferral_outstanding", label: "잔금유예액", kind: "money", sum: true },
    { key: "deferral_maturity", label: "유예 만기일", kind: "date" },
    { key: "late_fee", label: "연체료", kind: "money", sum: true },
    { key: "middle_loan_interest", label: "중도금 대납이자", kind: "money", sum: true },
    { key: "middle_loan_maturity", label: "중도금대출 만기", kind: "date" },
    { key: "terminated_count", label: "해지이력", kind: "num" },
    { key: "is_resale", label: "재판매", kind: "bool" },
    { key: "sales_manager", label: "담당자" },
  ];
  const floors = [...new Set(views.map((v) => v.floor))].sort((a, b) => a - b);
  const filters: FilterDef[] = [
    { key: "facility_type", label: "시설유형", options: { OFFICETEL: "오피스텔", RETAIL: "근린생활시설" } },
    { key: "floorKey", label: "층", options: Object.fromEntries(floors.map((f) => [String(f), `${f}층`])) },
    { key: "sale_state", label: "분양상태", options: SALE_STATE_LABEL },
    { key: "pay_state", label: "수납상태", options: PAY_STATE_LABEL },
    { key: "lease_state", label: "임대상태", options: LEASE_STATE_LABEL },
  ];

  const unsold = views.filter((v) => v.sale_state === "UNSOLD");
  const resaleCount = snap.data.contracts.filter((x) => x.is_resale && x.status !== "TERMINATED").length;
  const termCount = snap.data.contracts.filter((x) => x.status === "TERMINATED").length;

  return (
    <div className="space-y-5">
      <PageHeader
        code="B02"
        title="호실 및 분양계약관리"
        desc="모든 호실을 자산 ID로 관리합니다. 분양상태·수납상태·임대상태는 서로 독립적으로 산출되며, 계약해지 후 재판매 시에도 기존 계약·수납 이력은 삭제되지 않고 보존됩니다."
      />
      <Grid cols={6}>
        <Stat label="분양대상 호실" value={`${s.total}호`} sub={`오피스텔 ${s.officetel.total} · 근생 ${s.retail.total}`} />
        <Stat label="유효 계약" value={`${s.sold}호`} sub={<>분양률 <Pct v={s.saleRate} /></>} />
        <Stat label="미분양" value={`${unsold.length}호`} sub={<>현재가 합계 <Money v={sum(unsold, (v) => v.current_price)} /></>} tone="warn" />
        <Stat label="잔금 미수(연체+유예)" value={<Money v={c.unpaid} />} sub={`연체 ${c.overdueCount}건 · 유예 ${c.deferredCount}건`} tone="bad" />
        <Stat label="재판매 계약" value={`${resaleCount}건`} sub={`누적 해지 ${termCount}건`} />
        <Stat label="금액기준 분양률" value={<Pct v={s.amountRate} />} sub={<>계약 <Money v={s.contractedSupply} /></>} />
      </Grid>
      <Card title="호실 · 계약 통합 관리" sub="자산 ID를 클릭하면 계약·수납·유예·채권·임대·하자·재판매 이력을 한 화면에서 확인합니다.">
        <AssetsTabs
          rows={rows}
          cols={cols}
          filters={filters}
          initialQuery={q ?? ""}
          tabs={[
            { key: "units", label: "호실 현황", kind: "assetTable", visible: true },
            { key: "contracts", label: "분양계약(이력 포함)", kind: "entity", entity: "sale_contracts", canWrite: canWrite(user.role, "assets"), visible: true },
            { key: "payments", label: "수납내역", kind: "entity", entity: "payments", canWrite: canWrite(user.role, "receivables"), visible: canRead(user.role, "receivables") },
            { key: "deferrals", label: "잔금유예", kind: "entity", entity: "deferrals", canWrite: canWrite(user.role, "receivables"), visible: canRead(user.role, "receivables") },
            { key: "parties", label: "계약자(개인정보)", kind: "entity", entity: "contract_parties", canWrite: canWrite(user.role, "assets") && user.piiAccess, visible: true },
            { key: "master", label: "자산 마스터", kind: "entity", entity: "assets", canWrite: canWrite(user.role, "assets"), visible: true },
          ]}
        />
      </Card>
      <Note>
        재판매 등록 절차: ① 기존 계약을 <b>해지</b> 상태로 변경(해지일·사유 입력, 승인 필요) → ② 해지 환급을 수납내역에 음수(해지 환급)로 등록 → ③ 신규 계약을 <b>재판매=예</b>, 직전(해지)계약 ID를 입력하여 등록. 동일 호실에 유효 계약이 2건 이상 생기지 않도록 서버에서 차단합니다. 개인정보는 권한에 따라 서버에서 마스킹됩니다.
      </Note>
    </div>
  );
}
