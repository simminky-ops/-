import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { canWrite } from "@/lib/rbac";
import { crmStats } from "@/lib/calc/analytics";
import { ENTITIES } from "@/lib/entities";
import { FACILITY_LABEL, LEAD_STAGE_LABEL } from "@/lib/types";
import { addMonths, fmtNum, monthOf, ratio } from "@/lib/format";
import { Card, Grid, Note, PageHeader, Stat } from "@/components/ui";
import { Pct } from "@/components/money";
import { BarsChart } from "@/components/charts";
import { PeriodBars } from "@/components/period-charts";
import { DataTable } from "@/components/data-table";
import { EntityManager } from "@/components/entity-manager";

/** 월간 계약 목표(호) — 예시 가정값, 실제 영업계획 수립 시 변경 */
const MONTHLY_CONTRACT_TARGET = 4;

const CHANNEL = ENTITIES.crm_leads.fields.find((f) => f.key === "channel")!.options!;
const FUNNEL = ["INFLOW", "CONSULT", "VISIT", "OFFER", "NEGOTIATE", "CONTRACTED", "BALANCE_PAID", "AFTERCARE"] as const;

export default async function CrmPage() {
  const user = await requirePage("crm");
  const snap = getSnapshot();
  const { data } = snap;
  const asOf = data.settings.base_date;
  const st = crmStats(data);
  const monthStart = `${monthOf(asOf)}-01`;
  const thisMonth = crmStats(data, monthStart, asOf);

  // 퍼널: 계약체결 이후 단계는 연결된 계약의 수납 상태로 산출
  const contractById = new Map(data.contracts.map((c) => [c.id, c]));
  const contractedLeads = data.leads.filter((l) => l.contracted);
  const balancePaid = contractedLeads.filter((l) => l.contract_id && contractById.get(l.contract_id)?.status === "COMPLETED").length;
  const aftercare = data.leads.filter((l) => l.stage === "AFTERCARE").length;
  const funnelCounts: Record<string, number> = Object.fromEntries(st.funnel.map((f) => [f.stage, f.count]));
  funnelCounts.BALANCE_PAID = balancePaid;
  funnelCounts.AFTERCARE = aftercare;
  const top = Math.max(1, funnelCounts.INFLOW ?? st.leads);

  // 월별 계약실적 (준공 후 계약, 계약일 기준)
  const from = monthOf(data.settings.completion_date);
  const months: { period: string; newSale: number; resale: number; target: number }[] = [];
  for (let m = from; m <= monthOf(asOf); m = addMonths(m, 1)) months.push({ period: m, newSale: 0, resale: 0, target: MONTHLY_CONTRACT_TARGET });
  for (const c of data.contracts) {
    if (c.contract_date < data.settings.completion_date || c.contract_date > asOf) continue;
    const row = months.find((x) => x.period === monthOf(c.contract_date));
    if (!row) continue;
    if (c.is_resale) row.resale++;
    else row.newSale++;
  }
  const totalPost = months.reduce((s, m) => s + m.newSale + m.resale, 0);
  const targetPost = months.length * MONTHLY_CONTRACT_TARGET;

  const byManager = st.byManager.sort((a, b) => b.contracts - a.contracts).map((r) => ({ ...r, id: r.name }));
  const byChannel = st.byChannel.sort((a, b) => b.leads - a.leads).map((r) => ({ ...r, id: r.name, label: CHANNEL[r.name] ?? r.name }));
  const upcoming = st.upcoming.slice(0, 40).map((l) => ({
    id: l.id,
    next_date: l.next_date,
    manager: l.manager,
    stage: l.stage,
    interest_type: l.interest_type,
    interest_asset_id: l.interest_asset_id,
    discount_offer_rate: l.discount_offer_rate,
    expected_contract_date: l.expected_contract_date,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        code="B03"
        title="분양영업 CRM"
        desc="고객유입부터 계약·잔금납부·사후관리까지 영업활동을 관리합니다. 고객 개인정보는 개인정보 접근권한에 따라 서버에서 마스킹되며, 분양 담당자는 본인 배정 건만 수정할 수 있습니다."
      />
      <Grid cols={6}>
        <Stat label="누적 상담건수" value={`${fmtNum(st.leads)}건`} sub={`당월 신규 ${thisMonth.leads}건`} />
        <Stat label="유효 상담고객" value={`${fmtNum(st.valid)}명`} />
        <Stat label="현장방문율" value={<Pct v={st.visitRate} />} sub={`방문 ${st.visits}건 ÷ 유효상담`} />
        <Stat label="계약전환율" value={<Pct v={st.conversion} />} sub={`계약 ${st.contracts}건 ÷ 유효상담`} tone={st.conversion >= 20 ? "good" : "warn"} />
        <Stat label="재판매 계약" value={`${st.resaleContracts}건`} sub="CRM 연결 기준" />
        <Stat
          label="영업목표 대비 실적"
          value={<Pct v={ratio(totalPost, targetPost)} />}
          sub={`준공 후 ${totalPost}건 / 목표 ${targetPost}건 (월 ${MONTHLY_CONTRACT_TARGET}건·예시)`}
          tone={totalPost >= targetPost ? "good" : "warn"}
        />
      </Grid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card title="영업 퍼널" sub="고객유입 → 상담등록 → 현장방문 → 분양조건 제시 → 계약협의 → 계약체결 → 잔금납부 → 사후관리" className="xl:col-span-2">
          <ul className="space-y-2">
            {FUNNEL.map((s, i) => {
              const n = funnelCounts[s] ?? 0;
              const prev = i > 0 ? (funnelCounts[FUNNEL[i - 1]] ?? 0) : null;
              return (
                <li key={s}>
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span className="text-ink2">
                      {i + 1}. {LEAD_STAGE_LABEL[s]}
                    </span>
                    <span className="num font-semibold text-ink">
                      {n}건{prev ? <span className="ml-1.5 font-normal text-ink3">(전단계 대비 {fmtNum(ratio(n, prev), 0)}%)</span> : null}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-sm bg-bg2">
                    <div className="h-2.5 rounded-sm bg-[var(--s1)]" style={{ width: `${Math.max(2, ratio(n, top))}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-ink3">이탈 고객은 도달한 단계까지 집계합니다. 잔금납부는 연결 계약이 완납인 건입니다.</p>
        </Card>
        <Card title="월별 계약실적" sub={`준공(${from}) 이후 계약일 기준 · 점선 = 월 목표 ${MONTHLY_CONTRACT_TARGET}건(예시)`} className="xl:col-span-3">
          <PeriodBars
            data={months}
            x="period"
            flow={["newSale", "resale", "target"]}
            series={[
              { key: "newSale", label: "미분양 신규계약", stack: "a" },
              { key: "resale", label: "재판매", stack: "a" },
              { key: "target", label: "목표(예시)", color: "#b8c2cc" },
            ]}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="담당자별 계약성과">
          <BarsChart data={byManager} x="name" series={[{ key: "leads", label: "상담" }, { key: "contracts", label: "계약" }]} height={200} />
          <DataTable
            rows={byManager}
            dense
            maxHeight={220}
            cols={[
              { key: "name", label: "담당자" },
              { key: "leads", label: "상담", kind: "num" },
              { key: "visits", label: "방문", kind: "num" },
              { key: "contracts", label: "계약", kind: "num" },
              { key: "conversion", label: "전환율", kind: "pct" },
              { key: "amount", label: "계약금액", kind: "money", sum: true },
            ]}
          />
        </Card>
        <Card title="유입경로별 성과">
          <BarsChart data={byChannel} x="label" series={[{ key: "leads", label: "상담" }, { key: "contracts", label: "계약" }]} height={200} />
          <DataTable
            rows={byChannel}
            dense
            maxHeight={220}
            cols={[
              { key: "label", label: "유입경로" },
              { key: "leads", label: "상담", kind: "num" },
              { key: "visits", label: "방문", kind: "num" },
              { key: "contracts", label: "계약", kind: "num" },
              { key: "conversion", label: "전환율", kind: "pct" },
              { key: "amount", label: "계약금액", kind: "money", sum: true },
            ]}
          />
        </Card>
      </div>

      <Card title="다음 상담 예정" sub="진행 중(이탈·계약 제외) 고객 · 예정일 순 · 고객 개인정보 미표시">
        <DataTable
          rows={upcoming}
          dense
          maxHeight={300}
          cols={[
            { key: "next_date", label: "예정일", kind: "date" },
            { key: "id", label: "고객관리 ID" },
            { key: "manager", label: "담당자" },
            { key: "stage", label: "진행상태", map: LEAD_STAGE_LABEL },
            { key: "interest_type", label: "관심유형", map: FACILITY_LABEL },
            { key: "interest_asset_id", label: "관심 자산", link: "/assets/{interest_asset_id}" },
            { key: "discount_offer_rate", label: "할인제안", kind: "pct" },
            { key: "expected_contract_date", label: "예상 계약일", kind: "date" },
          ]}
        />
      </Card>

      <Card title="상담 등록·관리" sub="행을 클릭하면 상세·수정. 계약 체결 시 '계약완료=예', 연결 계약 ID를 입력하면 성과에 반영됩니다.">
        <EntityManager entity="crm_leads" canWrite={canWrite(user.role, "crm")} filters={["stage", "channel", "interest_type"]} links={{ interest_asset_id: "/assets/{interest_asset_id}" }} />
      </Card>
      <Note>계약전환율 = 계약 성사 고객 수 ÷ 유효 상담고객 수 × 100. 영업목표(월 {MONTHLY_CONTRACT_TARGET}건)는 예시 가정값입니다.</Note>
    </div>
  );
}
