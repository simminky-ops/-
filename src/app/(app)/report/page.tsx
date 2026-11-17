import { requirePage } from "@/lib/server/auth";
import { getReportData } from "@/lib/server/report-data";
import { ReportFrame, H } from "@/components/report-frame";
import { Amt } from "@/components/report-ui";
import { Card, Grid, Prose, Stat, StatusBadge } from "@/components/ui";
import { LinesChart, ProgressBar } from "@/components/charts";
import { fmtNum, fmtPct } from "@/lib/format";

export default async function ExecutiveSummary() {
  const user = await requirePage("report");
  const r = getReportData(user);
  const { sale, collection: c, lease, debt, scenarios, meta, mode } = r;
  const base = scenarios.find((s) => s.key === "BASE")!;
  const cons = scenarios.find((s) => s.key === "CONS")!;
  const opt = scenarios.find((s) => s.key === "OPT")!;
  const kind = mode === "index" ? "count" : "money";

  return (
    <ReportFrame
      code="A01"
      title="Executive Summary"
      desc="준공·사용승인 이후 분양·임대·채권회수·사업수지·채무상환의 현황과 정상화 방향을 요약합니다."
      meta={meta}
      mode={mode}
    >
      <Card title="핵심 요약">
        <Prose>
          <p>
            본 사업은 <b>수도권 업무·주거 복합개발지역</b>에 위치한 오피스텔 {sale.officetel.total}실과 근린생활시설 {sale.retail.total}실로 구성된 복합개발사업으로, {meta.completionDate}{" "}
            사용승인 이후 <b>분양 잔여재고 해소·잔금 회수·채무 상환</b>을 중심으로 한 사업 정상화 단계에 있습니다.
          </p>
          <ul>
            <li>
              기준일 현재 전체 분양률은 <b>{fmtPct(sale.saleRate)}</b>(오피스텔 {fmtPct(sale.officetel.rate)}, 근린생활시설 {fmtPct(sale.retail.rate)})이며, 미분양 {sale.unsoldUnits}실이 남아
              있습니다. 근린생활시설의 판매 부진이 상대적으로 크며 임대 활성화와 연계한 판매 전략이 필요합니다.
            </li>
            <li>
              잔금 회수율은 <b>{fmtPct(c.collectionRate)}</b>로, 연체 {c.overdueCount}건과 유예 {c.deferredCount}건의 회수관리가 현금흐름의 핵심 변수입니다.
            </li>
            <li>
              근린생활시설 임대율은 <b>{fmtPct(lease.rate)}</b>(전용면적 기준)이며 상층부(2~3층) 공실 해소가 과제입니다.
            </li>
            <li>
              총 채무 잔액은 <b>
                <Amt v={debt.balance} mode={mode} />
              </b>
              , 채무 상환율은 {fmtPct(debt.repayRate)}입니다. 기준 시나리오에서 채무 상환완료 예상시점은 <b>{base.summary.debtPayoffMonth ?? "검토기간 내 미완료"}</b>입니다.
            </li>
            <li>
              기준 시나리오 기준 예상 사업손익은 <b>
                <Amt v={base.feas.profit} mode={mode} />
              </b>
              (수익 대비 {fmtPct(base.feas.profitRate)})이며, 보수적 시나리오에서는 <Amt v={cons.feas.profit} mode={mode} />, 낙관적 시나리오에서는 <Amt v={opt.feas.profit} mode={mode} />로 추정됩니다.
            </li>
            {base.summary.shortageMonths.length > 0 && (
              <li>
                기준 시나리오에서도 {base.summary.shortageMonths[0]} 이후 일시적 자금부족 {base.summary.shortageMonths.length}개월이 예상되어(최소 필요자금 <Amt v={base.summary.requiredFunding} mode={mode} />),{" "}
                <b>채무 분납 협의 및 회수 가속화 또는 브릿지 자금 확보</b>가 선행되어야 합니다.
              </li>
            )}
          </ul>
        </Prose>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {r.kpis.map((k) => (
          <div key={k.key} className="rounded-lg border border-line bg-white p-3">
            <div className="text-xs text-ink2">{k.label}</div>
            <div className="num mt-1 text-lg font-bold">{k.unit === "%" ? fmtPct(k.value) : <Amt v={k.value} mode={mode} />}</div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-ink3">
              <span>목표 {k.target === null ? "-" : k.unit === "%" ? fmtPct(k.target) : <Amt v={k.target} mode={mode} />}</span>
              <StatusBadge status={k.status} />
            </div>
          </div>
        ))}
      </div>

      <Grid cols={2}>
        <Card title="목표 대비 진척도">
          <div className="space-y-3">
            <ProgressBar label="전체 분양률" value={sale.saleRate} target={r.kpis.find((k) => k.key === "sale_rate")?.target ?? undefined} />
            <ProgressBar label="금액기준 분양률" value={sale.amountRate} target={r.kpis.find((k) => k.key === "amount_sale_rate")?.target ?? undefined} />
            <ProgressBar label="잔금 회수율" value={c.collectionRate} target={r.kpis.find((k) => k.key === "collection_rate")?.target ?? undefined} />
            <ProgressBar label="근생 임대율" value={lease.rate} target={r.kpis.find((k) => k.key === "lease_rate")?.target ?? undefined} />
            <ProgressBar label="채무 상환율" value={debt.repayRate} target={r.kpis.find((k) => k.key === "repay_rate")?.target ?? undefined} />
          </div>
          <p className="mt-3 text-[11px] text-ink3">세로선은 목표값입니다.</p>
        </Card>
        <Card title={`향후 ${meta.cashflowMonths}개월 예상 기말현금`} sub={`${meta.cashflowStart} ~ ${meta.cashflowEnd} · 시나리오별`}>
          <LinesChart
            data={r.endingSeries}
            x="month"
            kind={kind}
            zeroLine
            series={[
              { key: "CONS", label: "보수적" },
              { key: "BASE", label: "기준" },
              { key: "OPT", label: "낙관적" },
            ]}
          />
        </Card>
      </Grid>

      <Card title="시나리오별 정상화 전망" pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>구분</th>
                {scenarios.map((s) => (
                  <th key={s.key} className="r">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="신규 판매(호)" vals={scenarios.map((s) => `${fmtNum(s.summary.newSalesUnits)}호`)} />
              <Row label="미분양 판매예정액" vals={scenarios.map((s) => <Amt key={s.key} v={s.summary.newSalesRevenue} mode={mode} />)} />
              <Row label="누적 분양 현금회수" vals={scenarios.map((s) => <Amt key={s.key} v={s.summary.salesCollections} mode={mode} />)} />
              <Row label="기간 말 기말현금" vals={scenarios.map((s) => <Amt key={s.key} v={s.summary.endingCash} mode={mode} />)} />
              <Row label="현금부족 개월 수" vals={scenarios.map((s) => `${s.summary.shortageMonths.length}개월`)} />
              <Row label="채무 상환완료 시점" vals={scenarios.map((s) => s.summary.debtPayoffMonth ?? "기간 내 미완료")} />
              <Row label="예상 사업손익" vals={scenarios.map((s) => <Amt key={s.key} v={s.feas.profit} mode={mode} />)} />
              <Row label="손익률(수익 대비)" vals={scenarios.map((s) => fmtPct(s.feas.profitRate))} />
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="정상화 전략 방향">
        <H n="1">단기 — 유동성 방어</H>
        <Prose>
          <ul>
            <li>연체 잔금 회수 집중(최고장·납부약정·법적조치 단계화)과 중도금대출 만기 도래 세대의 대위변제 위험 사전 차단</li>
            <li>국세·지방세·공사비 등 채무의 분납 협의 및 자금집행 우선순위 확정(신탁·금융기관 동의 전제)</li>
          </ul>
        </Prose>
        <H n="2">중기 — 재고 소진과 임대 활성화</H>
        <Prose>
          <ul>
            <li>할인·잔금유예 조건의 수익성 비교를 통한 판매조건 최적화(할인손실과 회수기간의 균형)</li>
            <li>근린생활시설 앵커테넌트 유치와 층별 MD 재편을 통한 집객력 확보 → 상가 매각가치 제고</li>
          </ul>
        </Prose>
        <H n="3">장기 — 채무 완제와 사업 종결</H>
        <Prose>
          <p>잔여 재고 매각, 유예금 만기 회수, 채무 완제 후 정산·사업 종결 절차를 진행합니다. 상세 일정은 A07 로드맵을 참조하십시오.</p>
        </Prose>
      </Card>

      <Grid cols={4}>
        <Stat label="미분양 재고" value={`${sale.unsoldUnits}실`} sub={<>현재가 합계 <Amt v={sale.unsoldValue} mode={mode} /></>} />
        <Stat label="잔금 미수금" value={<Amt v={c.unpaid} mode={mode} />} sub={<>연체 <Amt v={c.overdue} mode={mode} /> · 유예 <Amt v={c.deferred} mode={mode} /></>} tone="warn" />
        <Stat label="누적 자금 회수" value={<Amt v={c.collectedTotal} mode={mode} />} sub="해지 환급 차감 후" />
        <Stat label="총 채무 잔액" value={<Amt v={debt.balance} mode={mode} />} sub={`상환율 ${fmtPct(debt.repayRate)}`} tone="bad" />
      </Grid>
    </ReportFrame>
  );
}

function Row({ label, vals }: { label: string; vals: React.ReactNode[] }) {
  return (
    <tr>
      <td className="font-medium">{label}</td>
      {vals.map((v, i) => (
        <td key={i} className="r">
          {v}
        </td>
      ))}
    </tr>
  );
}
