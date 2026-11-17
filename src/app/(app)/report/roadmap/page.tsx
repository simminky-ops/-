import { requirePage } from "@/lib/server/auth";
import { getReportData } from "@/lib/server/report-data";
import { ReportFrame } from "@/components/report-frame";
import { Amt } from "@/components/report-ui";
import { Badge, Card, Grid, Prose, Stat } from "@/components/ui";
import { BarsChart } from "@/components/charts";
import { addMonths, fmtPct } from "@/lib/format";

export default async function RoadmapPage() {
  const user = await requirePage("report");
  const r = getReportData(user);
  const { meta, mode, scenarios, risks, ops } = r;
  const base = scenarios.find((s) => s.key === "BASE")!;
  const start = meta.cashflowStart;
  const kpi = (k: string) => r.kpis.find((x) => x.key === k);

  const phases = [
    { key: "S", name: "단기", range: "0~6개월", from: start, to: addMonths(start, 5), color: "var(--s1)" },
    { key: "M", name: "중기", range: "6~18개월", from: addMonths(start, 6), to: addMonths(start, 17), color: "var(--s3)" },
    { key: "L", name: "장기", range: "18~36개월", from: addMonths(start, 18), to: addMonths(start, 35), color: "var(--s5)" },
  ].map((p) => {
    const ms = r.endingSeries.filter((m) => m.month >= p.from && m.month <= p.to);
    const ds = r.debtSeries.filter((m) => m.month >= p.from && m.month <= p.to);
    const shortage = base.summary.shortageMonths.filter((m) => m >= p.from && m <= p.to);
    return {
      ...p,
      endCash: ms[ms.length - 1]?.BASE ?? null,
      minCash: ms.length ? Math.min(...ms.map((m) => m.BASE)) : null,
      debtEnd: ds[ds.length - 1]?.BASE ?? null,
      shortage,
      payoffInPhase: !!base.summary.debtPayoffMonth && base.summary.debtPayoffMonth >= p.from && base.summary.debtPayoffMonth <= p.to,
    };
  });

  const tasks: Record<string, { area: string; items: string[] }[]> = {
    S: [
      { area: "채권회수", items: ["연체 세대 최고장·납부약정 일괄 진행", "중도금대출 만기 도래 세대 대위변제 위험 대응", "장기 미납 세대 해지 여부 결정"] },
      { area: "자금·채무", items: ["국세·지방세 분납 이행 및 협의 완료", "신탁·금융기관과 자금집행 순위 확정", "브릿지 자금 필요 여부 판단"] },
      { area: "판매·임대", items: ["판매조건(할인·유예) 승인 및 적용", "1층 공실 해소, 2·3층 앵커 협상"] },
    ],
    M: [
      { area: "판매", items: ["오피스텔 잔여 재고 소진", "해지 물량 재판매", "근생 임대 완료 호실 수익형 매각 개시"] },
      { area: "임대·운영", items: ["앵커테넌트 입점·영업 개시", "층별 MD 재편 및 임대차 만기 관리", "하자보수 완료 및 재발 점검"] },
      { area: "자금·채무", items: ["미지급 공사비 분할 지급", "유예금 만기 회수", "PF 원리금 상환 일정 이행"] },
    ],
    L: [
      { area: "정상화 완료", items: ["잔여 재고 매각", "채무 완제", "소송·분쟁 종결 및 정산"] },
      { area: "사업 종결", items: ["사업비 최종 정산", "보존등기·관리 이관", "사업 종결 보고"] },
    ],
  };

  return (
    <ReportFrame code="A07" title="사업 정상화 로드맵" desc={`${start}부터 36개월간 단기·중기·장기 단계별 과제와 기준 시나리오 기반 마일스톤을 제시합니다.`} meta={meta} mode={mode}>
      <Card title="단계별 일정" sub={`${start} ~ ${addMonths(start, 35)} (기준 시나리오)`}>
        <div className="space-y-2">
          {phases.map((p) => (
            <div key={p.key} className="grid grid-cols-[90px_1fr] items-center gap-3">
              <div className="text-sm font-semibold">
                {p.name}
                <div className="text-[11px] font-normal text-ink3">{p.range}</div>
              </div>
              <div className="relative h-8 rounded bg-bg2">
                <div
                  className="absolute top-0 h-8 rounded px-2 text-[11px] leading-8 text-white"
                  style={{ left: `${(phases.indexOf(p) === 0 ? 0 : phases.indexOf(p) === 1 ? 6 : 18) / 36 * 100}%`, width: `${(p.key === "S" ? 6 : 12 + (p.key === "L" ? 6 : 0)) / 36 * 100}%`, background: p.color }}
                >
                  {p.from} ~ {p.to}
                </div>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[90px_1fr] gap-3 text-[11px] text-ink3">
            <span />
            <div className="flex justify-between">
              <span>{start}</span>
              <span>{addMonths(start, 12)}</span>
              <span>{addMonths(start, 24)}</span>
              <span>{addMonths(start, 35)}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {phases.map((p) => (
          <Card key={p.key} title={`${p.name} (${p.range})`} sub={`${p.from} ~ ${p.to}`}>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Stat label="단계 말 기말현금" value={<Amt v={p.endCash} mode={mode} />} tone={p.endCash !== null && p.endCash < 0 ? "bad" : undefined} />
              <Stat label="단계 말 채무잔액" value={<Amt v={p.debtEnd} mode={mode} />} />
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {p.shortage.length > 0 ? <Badge tone="bad">■ 현금부족 {p.shortage.length}개월 ({p.shortage[0]}~)</Badge> : <Badge tone="good">● 현금부족 없음</Badge>}
              {p.payoffInPhase && <Badge tone="good">● 채무 상환완료 {base.summary.debtPayoffMonth}</Badge>}
            </div>
            {tasks[p.key].map((t) => (
              <div key={t.area} className="mb-2">
                <div className="text-xs font-semibold text-teal">{t.area}</div>
                <ul className="mt-0.5 space-y-0.5 text-[12.5px] text-ink2">
                  {t.items.map((i) => (
                    <li key={i}>• {i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>
        ))}
      </div>

      <Card title="핵심 마일스톤 및 관리 목표" pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>마일스톤</th>
              <th>현재(기준일)</th>
              <th>목표 / 예상</th>
              <th>근거</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>전체 분양률</td>
              <td className="num">{fmtPct(kpi("sale_rate")?.value)}</td>
              <td className="num">목표 {fmtPct(kpi("sale_rate")?.target)}</td>
              <td>기준 시나리오 검토기간 내 {base.summary.newSalesUnits}호 판매, 기간 말 잔여 {base.summary.unsoldUnitsEnd}호</td>
            </tr>
            <tr>
              <td>잔금 회수율</td>
              <td className="num">{fmtPct(kpi("collection_rate")?.value)}</td>
              <td className="num">목표 {fmtPct(kpi("collection_rate")?.target)}</td>
              <td>
                기간 말 미회수 <Amt v={base.summary.receivableEnd} mode={mode} />
              </td>
            </tr>
            <tr>
              <td>근생 임대율</td>
              <td className="num">{fmtPct(kpi("lease_rate")?.value)}</td>
              <td className="num">목표 {fmtPct(kpi("lease_rate")?.target)}</td>
              <td>보유 공실 월 {base.assumptions.leaseUpSqmPerMonth}㎡ 신규임대 가정</td>
            </tr>
            <tr>
              <td>자금부족 해소</td>
              <td>{base.summary.shortageMonths.length ? `부족 ${base.summary.shortageMonths.length}개월 예상` : "부족 없음"}</td>
              <td>
                최소 필요자금 <Amt v={base.summary.requiredFunding} mode={mode} />
              </td>
              <td>최저 기말현금 {base.summary.minEndingMonth ?? "-"}</td>
            </tr>
            <tr>
              <td>채무 상환완료</td>
              <td className="num">상환율 {fmtPct(kpi("repay_rate")?.value)}</td>
              <td className="font-semibold">{base.summary.debtPayoffMonth ?? "검토기간 내 미완료"}</td>
              <td>
                기간 말 채무잔액 <Amt v={base.summary.debtBalanceEnd} mode={mode} />
              </td>
            </tr>
            <tr>
              <td>예상 사업손익</td>
              <td>-</td>
              <td>
                <Amt v={base.feas.profit} mode={mode} /> ({fmtPct(base.feas.profitRate)})
              </td>
              <td>보수적·낙관적 시나리오 비교는 A01·A06 참조</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Grid cols={2}>
        <Card title="리스크 관리 현황" sub="진행 중 리스크 유형별 건수(집계)">
          <BarsChart data={risks.byType} x="name" horizontal series={[{ key: "count", label: "건수" }]} height={Math.max(180, risks.byType.length * 30)} />
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink2">
            <span>진행 {risks.open}건</span>
            <span>우선순위 상 {risks.high}건</span>
            <span>
              예상비용 <Amt v={risks.expectedCost} mode={mode} />
            </span>
            <span>
              하자·민원 미완료 {ops.issuesOpen}건 (재발 {ops.recurrence}건)
            </span>
          </div>
          {!r.external && risks.top.length > 0 && (
            <table className="tbl mt-3">
              <thead>
                <tr>
                  <th>주요 리스크(내부)</th>
                  <th>우선</th>
                  <th>상태</th>
                  <th>다음조치</th>
                </tr>
              </thead>
              <tbody>
                {risks.top.map((x) => (
                  <tr key={x.title}>
                    <td className="!whitespace-normal">{x.title}</td>
                    <td>{x.priority}</td>
                    <td>{x.status}</td>
                    <td className="num">{x.next ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="추진 체계 및 모니터링">
          <Prose>
            <ul>
              <li>
                <b>주간</b>: 분양·수납·임대 실적과 업무기한 점검 (주간 사업운영 현황보고서)
              </li>
              <li>
                <b>월간</b>: KPI 목표 대비 실적, 36개월 현금흐름 갱신, 채무 상환 이행 점검 (월간 임원보고서)
              </li>
              <li>
                <b>분기</b>: 시나리오 가정 재설정, 판매조건·MD 전략 재검토, 금융기관 보고
              </li>
              <li>
                <b>승인 통제</b>: 중요 금액·계약정보 변경과 자금집행 우선순위는 경영진 승인 후 반영, 모든 변경은 이력 관리
              </li>
            </ul>
          </Prose>
          <p className="mt-3 text-[11px] text-ink3">본 로드맵의 일정·수치는 기준 시나리오 가정에 따른 예시 산출값으로, 실적 갱신 시 자동으로 재계산됩니다.</p>
        </Card>
      </Grid>
    </ReportFrame>
  );
}
