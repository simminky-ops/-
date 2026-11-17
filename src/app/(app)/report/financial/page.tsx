import { requirePage } from "@/lib/server/auth";
import { getReportData } from "@/lib/server/report-data";
import { ReportFrame } from "@/components/report-frame";
import { Amt } from "@/components/report-ui";
import { Card, Grid, Note, Prose, Stat } from "@/components/ui";
import { BarsChart, DonutChart, LinesChart } from "@/components/charts";
import { fmtPct } from "@/lib/format";

export default async function FinancialPage() {
  const user = await requirePage("report");
  const r = getReportData(user);
  const { meta, mode, feasibility: f, debt, scenarios, annual, inLabel, outLabel } = r;
  const kind = mode === "index" ? "count" : "money";
  const base = scenarios.find((s) => s.key === "BASE")!;

  return (
    <ReportFrame
      code="A06"
      title="사업수지 및 채무 상환계획"
      desc="기준 시나리오의 사업수지(손익)와 36개월 현금흐름, 국세·지방세·공사비·금융비용 등 채무 상환계획을 제시합니다."
      meta={meta}
      mode={mode}
    >
      <Grid cols={4}>
        <Stat label="예상 총수익(기준)" value={<Amt v={f.revenueTotal} mode={mode} />} />
        <Stat label="예상 총사업비(기준)" value={<Amt v={f.costTotal} mode={mode} />} sub={<>계획 <Amt v={f.budgetTotal} mode={mode} /></>} />
        <Stat label="예상 사업손익(기준)" value={<Amt v={f.profit} mode={mode} />} sub={`수익 대비 ${fmtPct(f.profitRate)}`} tone={f.profit < 0 ? "bad" : "good"} />
        <Stat label="누적 할인손실" value={<Amt v={f.discountLoss} mode={mode} />} sub="최초 분양가 대비" tone="warn" />
      </Grid>

      <Grid cols={2}>
        <Card title="1. 수입 구성 (기준 시나리오)" pad={false}>
          <table className="tbl">
            <tbody>
              {f.revenue.map((x) => (
                <tr key={x.label}>
                  <td>{x.label}</td>
                  <td className="r">
                    <Amt v={x.amount} mode={mode} />
                  </td>
                </tr>
              ))}
              <tr className="bg-[#f7f9fb] font-semibold">
                <td>총수익</td>
                <td className="r">
                  <Amt v={f.revenueTotal} mode={mode} />
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Card title="수입 구성비">
          <DonutChart kind={kind} data={f.revenue.filter((x) => x.amount > 0).map((x) => ({ name: x.label, value: x.amount }))} />
        </Card>
      </Grid>

      <Card title="2. 사업비 구성 — 기집행 / 미지급 / 향후 예정" sub="중복 집계 방지: 미지급 = 채무 잔액, 금융 차입원금은 비용에서 제외" pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>계정</th>
                <th className="r">계획</th>
                <th className="r">기집행</th>
                <th className="r">미지급</th>
                <th className="r">향후 예정</th>
                <th className="r">합계</th>
                <th className="r">계획 대비</th>
              </tr>
            </thead>
            <tbody>
              {f.costs.map((x) => (
                <tr key={x.label}>
                  <td>{x.label}</td>
                  <td className="r"><Amt v={x.budget} mode={mode} plain /></td>
                  <td className="r"><Amt v={x.executed} mode={mode} plain /></td>
                  <td className="r"><Amt v={x.unpaid} mode={mode} plain /></td>
                  <td className="r"><Amt v={x.future} mode={mode} plain /></td>
                  <td className="r font-semibold"><Amt v={x.total} mode={mode} plain /></td>
                  <td className={`r ${x.variance > 0 ? "text-bad" : "text-good"}`}>
                    {x.variance > 0 ? "▲ " : x.variance < 0 ? "▼ " : ""}
                    <Amt v={Math.abs(x.variance)} mode={mode} plain />
                  </td>
                </tr>
              ))}
              <tr className="bg-[#f7f9fb] font-semibold">
                <td>합계</td>
                <td className="r"><Amt v={f.budgetTotal} mode={mode} plain /></td>
                <td className="r"><Amt v={f.costs.reduce((a, x) => a + x.executed, 0)} mode={mode} plain /></td>
                <td className="r"><Amt v={f.costs.reduce((a, x) => a + x.unpaid, 0)} mode={mode} plain /></td>
                <td className="r"><Amt v={f.costs.reduce((a, x) => a + x.future, 0)} mode={mode} plain /></td>
                <td className="r"><Amt v={f.costTotal} mode={mode} plain /></td>
                <td className="r"><Amt v={f.costTotal - f.budgetTotal} mode={mode} plain /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Grid cols={2}>
        <Card title="시나리오별 예상 사업손익">
          <BarsChart data={scenarios.map((s) => ({ name: s.label, profit: s.feas.profit }))} x="name" kind={kind} series={[{ key: "profit", label: "예상 사업손익" }]} height={220} />
        </Card>
        <Card title="손익과 현금흐름의 차이">
          <table className="tbl">
            <tbody>
              {f.cashVsProfit.map((x) => (
                <tr key={x.label}>
                  <td className="!whitespace-normal">{x.label}</td>
                  <td className="r">
                    <Amt v={x.amount} mode={mode} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink3">신규 판매는 계약금액 전액을 수익으로 인식(발생주의)하나, 유예금·잔금 중 검토기간 이후 회수분은 현금흐름에 포함되지 않습니다.</p>
        </Card>
      </Grid>

      <Card title={`3. 연도별 현금흐름 요약 (기준 시나리오, ${meta.cashflowStart}~${meta.cashflowEnd})`} pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>항목</th>
                {annual.map((y) => (
                  <th key={y.year} className="r">
                    {y.year} ({y.months}개월)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(inLabel).map(([k, label]) => (
                <tr key={k}>
                  <td>(+) {label}</td>
                  {annual.map((y) => (
                    <td key={y.year} className="r"><Amt v={y.in[k]} mode={mode} plain /></td>
                  ))}
                </tr>
              ))}
              <tr className="bg-[#f7f9fb] font-semibold">
                <td>현금유입 계</td>
                {annual.map((y) => (
                  <td key={y.year} className="r"><Amt v={y.inTotal} mode={mode} plain /></td>
                ))}
              </tr>
              {Object.entries(outLabel).map(([k, label]) => (
                <tr key={k}>
                  <td>(−) {label}</td>
                  {annual.map((y) => (
                    <td key={y.year} className="r"><Amt v={y.out[k]} mode={mode} plain /></td>
                  ))}
                </tr>
              ))}
              <tr className="bg-[#f7f9fb] font-semibold">
                <td>현금유출 계</td>
                {annual.map((y) => (
                  <td key={y.year} className="r"><Amt v={y.outTotal} mode={mode} plain /></td>
                ))}
              </tr>
              <tr className="font-semibold">
                <td>연말 기말현금</td>
                {annual.map((y) => (
                  <td key={y.year} className={`r ${y.ending < 0 ? "text-bad" : ""}`}><Amt v={y.ending} mode={mode} plain /></td>
                ))}
              </tr>
              <tr>
                <td>채무 상환액(원금·가산금)</td>
                {annual.map((y) => (
                  <td key={y.year} className="r"><Amt v={y.debtPaid} mode={mode} plain /></td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="4. 채무 현황 및 상환계획">
        <Grid cols={2}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>채무 유형</th>
                  <th className="r">발생액</th>
                  <th className="r">상환</th>
                  <th className="r">잔액</th>
                </tr>
              </thead>
              <tbody>
                {debt.byType.map((x) => (
                  <tr key={x.type}>
                    <td>{x.type}</td>
                    <td className="r"><Amt v={x.principal} mode={mode} plain /></td>
                    <td className="r"><Amt v={x.repaid} mode={mode} plain /></td>
                    <td className="r font-semibold"><Amt v={x.remaining} mode={mode} plain /></td>
                  </tr>
                ))}
                <tr className="bg-[#f7f9fb] font-semibold">
                  <td>합계</td>
                  <td className="r"><Amt v={debt.byType.reduce((a, x) => a + x.principal, 0)} mode={mode} plain /></td>
                  <td className="r"><Amt v={debt.byType.reduce((a, x) => a + x.repaid, 0)} mode={mode} plain /></td>
                  <td className="r"><Amt v={debt.balance} mode={mode} plain /></td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink2">
              채무 상환율 {fmtPct(debt.repayRate)} · 기준 시나리오 상환완료 예상 <b>{base.summary.debtPayoffMonth ?? "검토기간 내 미완료"}</b>
            </p>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-ink2">시나리오별 채무 잔액 추이</div>
            <LinesChart
              data={r.debtSeries}
              x="month"
              kind={kind}
              series={[
                { key: "CONS", label: "보수적" },
                { key: "BASE", label: "기준" },
                { key: "OPT", label: "낙관적" },
              ]}
              height={240}
            />
          </div>
        </Grid>
        {!r.external && debt.rows.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <div className="mb-1 text-xs font-semibold text-ink2">채무별 상세 (내부 보고용)</div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>우선순위</th>
                  <th>채무 ID</th>
                  <th>유형</th>
                  <th>채권자 구분</th>
                  <th className="r">발생액</th>
                  <th className="r">상환</th>
                  <th className="r">잔액</th>
                  <th>납부기한</th>
                  <th>분납</th>
                </tr>
              </thead>
              <tbody>
                {debt.rows
                  .slice()
                  .sort((a, b) => a.priority - b.priority)
                  .map((x) => (
                    <tr key={x.id}>
                      <td className="num">{x.priority}</td>
                      <td>{x.id}</td>
                      <td>{x.type}</td>
                      <td>{x.creditor}</td>
                      <td className="r"><Amt v={x.principal} mode={mode} plain /></td>
                      <td className="r"><Amt v={x.repaid} mode={mode} plain /></td>
                      <td className="r"><Amt v={x.remaining} mode={mode} plain /></td>
                      <td className="num">{x.due ?? "-"}</td>
                      <td>{{ NONE: "-", NEGOTIATING: "협의중", AGREED: "합의" }[x.installment] ?? x.installment}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="상환 원칙">
        <Note>자금집행 우선순위는 계약상 지급순위, 신탁 및 금융약정, 법률상 의무, 관련 당사자 동의조건에 따라 관리자가 설정하고 경영진 승인을 거쳐 확정합니다.</Note>
        <Prose>
          <ul>
            <li>국세·지방세는 가산금 증가와 체납처분 위험을 고려해 분납 합의 일정을 최우선으로 이행합니다.</li>
            <li>PF 원리금은 금융약정상 상환 일정과 만기 연장 조건을 준수하며, 잔금 회수액을 신탁 순위에 따라 상환에 투입합니다.</li>
            <li>미지급 공사비는 준공정산 합의에 따른 분할 지급 계획으로 관리하고, 하자보수 이행과 연계합니다.</li>
            <li>상환계획 외 잉여현금은 최소 보유현금과 향후 3개월 예정 상환액을 유보한 뒤 우선순위에 따라 조기상환합니다(수입 연동 상환).</li>
          </ul>
        </Prose>
      </Card>
    </ReportFrame>
  );
}
