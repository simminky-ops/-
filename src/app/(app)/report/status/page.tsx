import { requirePage } from "@/lib/server/auth";
import { getReportData } from "@/lib/server/report-data";
import { ReportFrame } from "@/components/report-frame";
import { Amt } from "@/components/report-ui";
import { Card, Grid, Prose, Stat } from "@/components/ui";
import { BarsChart, DonutChart } from "@/components/charts";
import { fmtNum, fmtPct } from "@/lib/format";

const PAY_LABEL: Record<string, string> = { PAID: "완납", NORMAL: "정상(기한 내)", NOT_DUE: "잔금 도래 전", DEFERRED: "유예중", OVERDUE: "연체" };

export default async function StatusPage() {
  const user = await requirePage("report");
  const r = getReportData(user);
  const { meta, mode, sale, collection: c, lease, crm } = r;

  return (
    <ReportFrame code="A04" title="분양·임대·사업현황 분석" desc="분양 진척, 잔금 수납, 임대 현황 및 영업 성과를 집계 기준으로 분석합니다." meta={meta} mode={mode}>
      <Grid cols={4}>
        <Stat label="전체 분양률" value={fmtPct(sale.saleRate)} sub={`${sale.sold} / ${sale.total}실`} />
        <Stat label="금액기준 분양률" value={fmtPct(sale.amountRate)} sub="최초 분양가 합계 대비" />
        <Stat label="잔금 회수율" value={fmtPct(c.collectionRate)} sub={`연체 ${c.overdueCount}건 · 유예 ${c.deferredCount}건`} tone={c.collectionRate < 90 ? "warn" : "good"} />
        <Stat label="근생 임대율" value={fmtPct(lease.rate)} sub={`${fmtNum(lease.leasedArea, 0)} / ${fmtNum(lease.leasable, 0)}㎡`} tone={lease.rate < 70 ? "warn" : "good"} />
      </Grid>

      <Card title="1. 분양 현황">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-ink2">월별 계약 실적 (준공 연도)</div>
            <BarsChart
              data={r.salesMonthly}
              x="period"
              series={[
                { key: "newSale", label: "신규분양", stack: "a" },
                { key: "resale", label: "재판매", stack: "a" },
                { key: "terminated", label: "계약해지" },
              ]}
              height={240}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-ink2">구역별 분양률</div>
            <BarsChart data={r.saleBands} x="name" kind="pct" horizontal series={[{ key: "rate", label: "분양률" }]} height={240} />
          </div>
        </div>
        <table className="tbl mt-4">
          <thead>
            <tr>
              <th>구분</th>
              <th className="r">분양대상</th>
              <th className="r">유효계약</th>
              <th className="r">미분양</th>
              <th className="r">분양률</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["오피스텔", sale.officetel],
              ["근린생활시설", sale.retail],
            ].map(([n, x]) => {
              const v = x as typeof sale.officetel;
              return (
                <tr key={n as string}>
                  <td className="font-medium">{n as string}</td>
                  <td className="r num">{v.total}</td>
                  <td className="r num">{v.sold}</td>
                  <td className="r num">{v.total - v.sold}</td>
                  <td className="r num">{fmtPct(v.rate)}</td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td>합계</td>
              <td className="r num">{sale.total}</td>
              <td className="r num">{sale.sold}</td>
              <td className="r num">{sale.unsoldUnits}</td>
              <td className="r num">{fmtPct(sale.saleRate)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="유효 계약 공급금액" value={<Amt v={sale.contractedSupply} mode={mode} />} />
          <Stat label="미분양 재고(현재가)" value={<Amt v={sale.unsoldValue} mode={mode} />} />
          <Stat label="누적 할인금액" value={<Amt v={sale.discountTotal} mode={mode} />} tone="warn" />
          <Stat label="해지 / 재판매" value={`${sale.terminatedCount}건 / ${sale.resaleCount}건`} />
        </div>
      </Card>

      <Grid cols={2}>
        <Card title="2. 잔금 수납 현황" sub="잔금 청구 확정분(납부기한 도래) 기준">
          <table className="tbl">
            <tbody>
              {[
                ["잔금 청구 확정액", c.billed],
                ["잔금 수납액(잔금+유예금 회수)", c.collected],
                ["잔금 미수금", c.unpaid],
                ["　└ 연체원금", c.overdue],
                ["　└ 만기 전 유예잔액", c.deferred],
                ["발생 연체료(누계)", c.lateFee],
                ["유효계약 전체 미수(공급금액 기준)", c.totalOutstanding],
              ].map(([k, v]) => (
                <tr key={k as string}>
                  <td>{k as string}</td>
                  <td className="r">
                    <Amt v={v as number} mode={mode} />
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>잔금 회수율 / 미수금 비율</td>
                <td className="r num">
                  {fmtPct(c.collectionRate)} / {fmtPct(c.receivableRate)}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Card title="계약 호실의 수납 상태 분포" sub="호실 수">
          <DonutChart kind="count" data={Object.entries(c.payStates).map(([k, v]) => ({ name: PAY_LABEL[k] ?? k, value: v })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)} />
        </Card>
      </Grid>

      <Grid cols={2}>
        <Card title="3. 근린생활시설 임대 현황" pad={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th>층</th>
                <th className="r">호실</th>
                <th className="r">임대 호실</th>
                <th className="r">전용면적</th>
                <th className="r">임대면적</th>
                <th className="r">임대율</th>
              </tr>
            </thead>
            <tbody>
              {lease.byFloor.map((f) => (
                <tr key={f.floor}>
                  <td>{f.floor}</td>
                  <td className="r num">{f.units}</td>
                  <td className="r num">{f.leasedUnits}</td>
                  <td className="r num">{fmtNum(f.area, 1)}㎡</td>
                  <td className="r num">{fmtNum(f.leased, 1)}㎡</td>
                  <td className="r num">{fmtPct(f.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-3 p-4">
            <Stat label="월 임대료 합계(전체 귀속)" value={<Amt v={lease.monthlyRent} mode={mode} />} />
            <Stat label="사업주체 귀속 연 임대수입" value={<Amt v={lease.devAnnualRent} mode={mode} />} />
            <Stat label="영업중 / 계약" value={`${lease.openCount} / ${lease.activeCount}건`} sub={`앵커 ${lease.anchors}개`} />
            <Stat label="협상 파이프라인" value={`${lease.pipeline}건`} sub={`12개월 내 만기 ${lease.expiringCount}건`} />
          </div>
        </Card>
        <Card title="임차 업종 구성" sub="임대면적 비중(%)">
          <DonutChart kind="pct" data={lease.industryMix.map((x) => ({ name: x.name, value: Math.round(x.share * 10) / 10 }))} />
        </Card>
      </Grid>

      <Card title="4. 분양영업 성과 (집계)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="상담 고객" value={`${crm.leads}명`} />
          <Stat label="유효 상담" value={`${crm.valid}명`} />
          <Stat label="현장 방문" value={`${crm.visits}명`} />
          <Stat label="계약 전환" value={`${crm.contracts}건`} sub={`전환율 ${fmtPct(crm.conversion)}`} />
          <Stat label="조건협의 진행" value={`${crm.pipeline}건`} />
        </div>
      </Card>

      <Card title="분석 의견">
        <Prose>
          <ul>
            <li>오피스텔은 분양률 {fmtPct(sale.officetel.rate)}로 재고 소진 단계에 있으나, 해지 {sale.terminatedCount}건이 발생해 재판매 관리가 필요합니다.</li>
            <li>근린생활시설은 분양률 {fmtPct(sale.retail.rate)}·임대율 {fmtPct(lease.rate)}로 판매와 임대 모두 부진하며, 임대 선행 후 매각 전략이 유효합니다.</li>
            <li>잔금 미수 중 연체원금의 회수 지연은 현금흐름 및 채무 상환일정에 직접 영향을 주므로 회수 단계별 관리(B05)가 필요합니다.</li>
          </ul>
        </Prose>
      </Card>
    </ReportFrame>
  );
}
