import Link from "next/link";
import { clsx } from "clsx";
import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { canWrite } from "@/lib/rbac";
import { isLeaseActive, leaseStats } from "@/lib/calc/analytics";
import { LEASE_STATUS_LABEL, RECIPIENT_LABEL } from "@/lib/types";
import { fmtNum, ratio, sum } from "@/lib/format";
import { Card, Grid, Note, PageHeader, Stat } from "@/components/ui";
import { Money, Pct } from "@/components/money";
import { BarsChart, DonutChart } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { EntityManager } from "@/components/entity-manager";

const MD_HYPOTHESIS: Record<number, string> = {
  1: "생활밀착형 음식점·간편식·편의서비스·프랜차이즈·생활편의",
  2: "카페·외식·디저트·음식점·체류형 서비스",
  3: "의료·교육·전문서비스·생활서비스",
};

export default async function LeasingPage() {
  const user = await requirePage("leasing");
  const snap = getSnapshot();
  const { data } = snap;
  const asOf = data.settings.base_date;
  const ls = leaseStats(data, asOf);
  const retail = data.assets.filter((a) => a.leasable);
  const viewBy = new Map(snap.values.views.map((v) => [v.id, v]));
  const active = data.leases.filter((l) => isLeaseActive(l, asOf));
  const activeBy = new Map(active.map((l) => [l.asset_id, l]));
  const pipelineBy = new Map(data.leases.filter((l) => ["LEAD", "NEGOTIATING", "LOI"].includes(l.negotiation_status)).map((l) => [l.asset_id, l]));
  const floors = [...new Set(retail.map((a) => a.floor))].sort((a, b) => a - b);

  const devActive = active.filter((l) => l.income_recipient === "DEVELOPER");
  const devMonthly = sum(devActive, (l) => l.monthly_rent);
  const ownerMonthly = sum(active.filter((l) => l.income_recipient === "OWNER"), (l) => l.monthly_rent);
  const opMonthly = sum(active.filter((l) => l.income_recipient === "OPERATOR"), (l) => l.monthly_rent);
  const notOpened = active.filter((l) => l.negotiation_status === "CONTRACTED");
  const rentFreeNow = active.filter((l) => l.start_date && l.rent_free_months > 0);
  const supportTotal = sum(active, (l) => l.tenant_support + l.leasing_fee);

  const expiring = ls.expiring.map((l) => ({ id: l.id, asset_id: l.asset_id, tenant_name: l.tenant_name, actual_industry: l.actual_industry, end_date: l.end_date, monthly_rent: l.monthly_rent, income_recipient: l.income_recipient }));
  const openStatus = active
    .map((l) => ({
      id: l.id,
      asset_id: l.asset_id,
      floor: viewBy.get(l.asset_id)?.floor ?? null,
      actual_industry: l.actual_industry,
      is_anchor: l.is_anchor,
      start_date: l.start_date,
      move_in_date: l.move_in_date,
      open_date: l.open_date,
      rent_free_months: l.rent_free_months,
      status: l.negotiation_status,
      delayed: l.negotiation_status === "CONTRACTED" && l.move_in_date && l.move_in_date < asOf ? "입점 지연" : "",
    }))
    .sort((a, b) => String(a.asset_id).localeCompare(String(b.asset_id)));

  return (
    <div className="space-y-5">
      <PageHeader
        code="B04"
        title="임대 및 MD 통합관리"
        desc="근린생활시설의 공실 해소와 집객력 향상을 위한 임대·MD 관리. 임대수익은 수취 주체(개별 소유자/사업시행법인/운영법인)별로 구분하여, 사업시행법인 귀속분만 B07 현금흐름에 자동 반영됩니다."
      />
      <Grid cols={6}>
        <Stat label="전체 임대율(면적)" value={<Pct v={ls.rate} />} sub={`${fmtNum(ls.leasedArea, 1)} / ${fmtNum(ls.leasable, 1)}㎡`} tone={ls.rate >= (data.settings.targets.lease_rate ?? 75) ? "good" : "warn"} />
        <Stat label="공실 비율" value={<Pct v={ls.vacancyRate} />} sub={`공실 ${retail.length - ls.activeCount}호`} tone="bad" />
        <Stat label="임대료 단가" value={`${fmtNum(ls.rentPerSqm / 10000, 2)}만원/㎡`} sub="월임대료 ÷ 계약 전용면적" />
        <Stat label="예상 연간 임대수익(전체)" value={<Money v={ls.annualRent} />} sub={<>사업시행법인 귀속 <Money v={devMonthly * 12} /></>} />
        <Stat label="앵커테넌트" value={`${ls.anchors}개`} sub={`협상 파이프라인 ${ls.pipeline}건`} />
        <Stat label="입점·영업개시" value={`${ls.openCount} / ${ls.activeCount}`} sub={`영업 미개시 ${notOpened.length}건`} />
      </Grid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="층별 임대율" sub="전용면적 기준">
          <BarsChart data={ls.byFloor} x="floor" kind="pct" series={[{ key: "rate", label: "임대율" }]} refLine={{ y: data.settings.targets.lease_rate ?? 75, label: "목표" }} height={220} />
          <table className="tbl mt-2">
            <thead>
              <tr>
                <th>층</th>
                <th className="r">호실</th>
                <th className="r">임대</th>
                <th className="r">면적(㎡)</th>
                <th className="r">임대율</th>
              </tr>
            </thead>
            <tbody>
              {ls.byFloor.map((f) => (
                <tr key={f.floor}>
                  <td>{f.floor}</td>
                  <td className="r num">{f.units}</td>
                  <td className="r num">{f.leasedUnits}</td>
                  <td className="r num">{fmtNum(f.area, 1)}</td>
                  <td className="r num">{fmtNum(f.rate, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="업종별 면적 비중" sub="임대 중 호실 전용면적 기준(㎡)">
          <DonutChart data={ls.industryMix.map((m) => ({ name: m.name, value: Math.round(m.area * 10) / 10 }))} kind="count" />
        </Card>
        <Card title="임대수익 귀속 구분" sub="월임대료 기준 · 현금흐름 연결 여부">
          <ul className="space-y-2 text-[13px]">
            {[
              ["DEVELOPER", devMonthly, "B07 현금흐름 반영"],
              ["OWNER", ownerMonthly, "개별 소유자 귀속 — 사업현금흐름 제외"],
              ["OPERATOR", opMonthly, "운영법인 귀속 — 정산 약정에 따름"],
            ].map(([k, v, note]) => (
              <li key={k as string} className="rounded-md border border-line p-2.5">
                <div className="flex justify-between">
                  <span className="font-semibold">{RECIPIENT_LABEL[k as "OWNER"]}</span>
                  <span className="num font-bold">
                    <Money v={v as number} unit="MAN" />/월
                  </span>
                </div>
                <div className="text-xs text-ink3">
                  {note as string} · 비중 {fmtNum(ratio(v as number, ls.monthlyRent), 1)}%
                </div>
              </li>
            ))}
            <li className="text-xs text-ink2">
              임차인 지원(지원금+유치수수료) 누계 <Money v={supportTotal} /> · 렌트프리 적용 {rentFreeNow.length}건
            </li>
          </ul>
        </Card>
      </div>

      <Card title="층별 MD 보드" sub="추천업종(초기 MD 가설) vs 실제 임차 업종 · 붉은 칸 = 공실">
        <div className="space-y-4">
          {floors.map((f) => (
            <div key={f}>
              <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-bold">{f}층</span>
                <span className="text-xs text-ink3">MD 가설: {MD_HYPOTHESIS[f] ?? "생활서비스 등"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
                {retail
                  .filter((a) => a.floor === f)
                  .map((a) => {
                    const l = activeBy.get(a.id);
                    const p = pipelineBy.get(a.id);
                    const v = viewBy.get(a.id);
                    return (
                      <Link
                        key={a.id}
                        href={`/assets/${a.id}`}
                        className={clsx(
                          "rounded-md border p-2 text-[11.5px] leading-snug hover:shadow",
                          l ? (l.negotiation_status === "OPEN" ? "border-good/30 bg-good-bg" : "border-teal/30 bg-teal-soft") : p ? "border-warn/40 bg-warn-bg" : "border-bad/30 bg-bad-bg",
                        )}
                      >
                        <div className="flex justify-between font-semibold text-ink">
                          <span>{a.id}</span>
                          <span className="num text-ink3">{fmtNum(a.exclusive_area, 0)}㎡</span>
                        </div>
                        <div className="text-ink3">추천: {a.recommended_industry ?? "-"}</div>
                        <div className="font-medium text-ink">
                          {l ? `${l.actual_industry ?? "-"}${l.is_anchor ? " ★앵커" : ""}` : p ? `협상: ${p.desired_industry ?? "-"} (${LEASE_STATUS_LABEL[p.negotiation_status]})` : "공실"}
                        </div>
                        <div className="text-ink3">{v?.sale_state === "UNSOLD" ? "사업주체 보유" : "분양(소유자)"}</div>
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink2">
          <span>■ 녹색: 영업중</span>
          <span>■ 청록: 임대계약(영업 전)</span>
          <span>■ 황색: 협상중</span>
          <span>■ 적색: 공실</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="입점 및 영업개시 현황" sub="임대 중 호실 · 입점 지연 표시">
          <DataTable
            rows={openStatus}
            dense
            maxHeight={320}
            cols={[
              { key: "asset_id", label: "자산 ID", link: "/assets/{asset_id}" },
              { key: "actual_industry", label: "업종" },
              { key: "is_anchor", label: "앵커", kind: "bool" },
              { key: "start_date", label: "계약시작", kind: "date" },
              { key: "rent_free_months", label: "렌트프리(월)", kind: "num" },
              { key: "move_in_date", label: "입점예정", kind: "date" },
              { key: "open_date", label: "영업개시", kind: "date" },
              { key: "status", label: "상태", map: LEASE_STATUS_LABEL, tone: { OPEN: "good", CONTRACTED: "info" } },
              { key: "delayed", label: "비고" },
            ]}
          />
        </Card>
        <Card title="임대차 계약 만기도래" sub="향후 12개월 이내 종료 예정">
          <DataTable
            rows={expiring}
            dense
            maxHeight={320}
            emptyText="12개월 이내 만기도래 임대차가 없습니다."
            cols={[
              { key: "asset_id", label: "자산 ID", link: "/assets/{asset_id}" },
              { key: "tenant_name", label: "임차인" },
              { key: "actual_industry", label: "업종" },
              { key: "end_date", label: "종료일", kind: "date" },
              { key: "monthly_rent", label: "월임대료", kind: "money" },
              { key: "income_recipient", label: "귀속", map: RECIPIENT_LABEL },
            ]}
          />
        </Card>
      </div>

      <Card title="임대차·협상 관리" sub="임차인 상담·협상·계약 진행 및 렌트프리·지원조건 관리">
        <EntityManager entity="leases" canWrite={canWrite(user.role, "leasing")} filters={["negotiation_status", "income_recipient"]} />
      </Card>
      <Note tone="warn">
        층별 업종 구성은 <b>초기 MD 가설</b>입니다. 실제 업종 적합성은 건축물 법적 용도(제1·2종 근린생활시설), 급배수·배기·전기용량 등 설비, 배후 수요, 경쟁 환경을 분석하여 결정해야 합니다.
      </Note>
    </div>
  );
}
