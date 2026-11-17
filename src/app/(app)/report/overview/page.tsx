import { requirePage } from "@/lib/server/auth";
import { getReportData } from "@/lib/server/report-data";
import { ReportFrame, H } from "@/components/report-frame";
import { Amt } from "@/components/report-ui";
import { Card, Grid, Prose, Stat } from "@/components/ui";
import { BarsChart, DonutChart } from "@/components/charts";
import { fmtNum, fmtPct } from "@/lib/format";

export default async function OverviewPage() {
  const user = await requirePage("report");
  const r = getReportData(user);
  const { meta, mode, sale, composition } = r;

  const facts: [string, React.ReactNode][] = [
    ["사업명", "수도권 A복합개발사업"],
    ["시스템명", "A-D PROJECT"],
    ["사업위치", "수도권 업무·주거 복합개발지역 (상세 주소 비공개)"],
    ["사업유형", "오피스텔 및 근린생활시설 복합개발"],
    ["사업단계", "준공 및 사용승인 완료 → 분양·임대·채권회수·사업정상화 단계"],
    ["사용승인일", meta.completionDate],
    ["공급규모", `오피스텔 ${composition[0].units}실 · 근린생활시설 ${composition[1].units}실 (총 ${sale.total}실)`],
    ["총 공급예정금액", <Amt key="t" v={sale.totalList} mode={mode} />],
    ["보고 기준일", meta.baseDate],
  ];
  const parties: [string, string, string][] = [
    ["사업주체", "사업시행법인", "사업 총괄, 분양·임대 및 자금 집행"],
    ["시공", "시공사 A", "준공정산, 하자보수 책임"],
    ["수탁", "신탁회사 A", "분양대금 관리 및 자금집행 순위 관리"],
    ["금융", "금융기관 A", "PF 대출 및 중도금 대출 취급"],
  ];

  return (
    <ReportFrame code="A02" title="사업개요" desc="사업의 기본 구성, 공급 규모, 참여 주체와 사업 단계를 정리합니다." meta={meta} mode={mode}>
      <Grid cols={2}>
        <Card title="사업 기본정보">
          <table className="tbl">
            <tbody>
              {facts.map(([k, v]) => (
                <tr key={k}>
                  <th className="w-36 !static">{k}</th>
                  <td className="!whitespace-normal">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink3">※ 현장 식별 방지를 위해 사업장명·주소·브랜드·당사자명은 일반화 명칭으로 표기합니다.</p>
        </Card>
        <Card title="참여 주체 (일반화 명칭)">
          <table className="tbl">
            <thead>
              <tr>
                <th>구분</th>
                <th>명칭</th>
                <th>역할</th>
              </tr>
            </thead>
            <tbody>
              {parties.map(([a, b, c]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td className="font-medium">{b}</td>
                  <td className="!whitespace-normal">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4">
            <H n="·">사업 단계</H>
            <ol className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              {["착공·분양", "준공·사용승인", "잔금·미분양 해소", "채무 완제·정산"].map((s, i) => (
                <li key={s} className={`rounded-md border px-2 py-2 text-center ${i === 2 ? "border-teal bg-teal-soft font-semibold text-teal" : "border-line text-ink2"}`}>
                  {i + 1}. {s}
                  {i === 2 && <div className="text-[10px]">현재 단계</div>}
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </Grid>

      <Card title="시설 구성" pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>시설유형</th>
                <th className="r">호실 수</th>
                <th>층 구성</th>
                <th className="r">전용면적 합계</th>
                <th className="r">계약면적 합계</th>
                <th className="r">평균 전용면적</th>
                <th className="r">공급예정금액</th>
                <th className="r">금액 비중</th>
              </tr>
            </thead>
            <tbody>
              {composition.map((c) => (
                <tr key={c.type}>
                  <td className="font-medium">{c.type}</td>
                  <td className="r num">{fmtNum(c.units)}</td>
                  <td>{c.floors}</td>
                  <td className="r num">{fmtNum(c.exArea, 1)}㎡</td>
                  <td className="r num">{fmtNum(c.contractArea, 1)}㎡</td>
                  <td className="r num">{fmtNum(c.avgEx, 1)}㎡</td>
                  <td className="r">
                    <Amt v={c.listTotal} mode={mode} />
                  </td>
                  <td className="r num">{fmtPct(c.listShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Grid cols={2}>
        <Card title="호실 구성" sub="호실 수 기준">
          <DonutChart kind="count" data={composition.map((c) => ({ name: c.type, value: c.units }))} />
        </Card>
        <Card title="공급예정금액 구성" sub="금액 비중(%)">
          <DonutChart kind="pct" data={composition.map((c) => ({ name: c.type, value: Math.round(c.listShare * 10) / 10 }))} />
        </Card>
      </Grid>

      <Card title="층·구역별 분양 현황" sub="호실 수 기준 (분양 / 미분양)">
        <BarsChart
          data={r.saleBands.map((b) => ({ name: b.name, sold: b.sold, unsold: b.units - b.sold }))}
          x="name"
          series={[
            { key: "sold", label: "분양", stack: "a" },
            { key: "unsold", label: "미분양", stack: "a" },
          ]}
          height={260}
        />
      </Card>

      <Grid cols={4}>
        <Stat label="총 공급 호실" value={`${sale.total}실`} />
        <Stat label="유효 계약 호실" value={`${sale.sold}실`} sub={`분양률 ${fmtPct(sale.saleRate)}`} />
        <Stat label="준공 후 신규 판매" value={`${sale.postCompletionSales}건`} sub={`재판매 ${sale.resaleCount}건`} />
        <Stat label="계약 해지 누계" value={`${sale.terminatedCount}건`} tone="warn" />
      </Grid>

      <Card title="사업 개요 해설">
        <Prose>
          <p>
            본 사업은 업무·주거 수요가 결합된 수도권 복합개발지역에서 소형 오피스텔과 저층부 근린생활시설을 함께 공급한 복합개발사업입니다. 오피스텔은 1~2인 가구 및 소형
            업무수요를, 근린생활시설은 단지 내·외 배후수요를 대상으로 합니다.
          </p>
          <p>
            준공 이후에는 <b>분양대금 잔금 회수</b>와 <b>잔여 재고 판매</b>가 자금 원천의 대부분을 차지하며, 회수된 자금은 신탁 및 금융약정에 따른 순위에 따라 PF 원리금,
            공사비, 제세공과금 상환에 투입됩니다. 따라서 판매·회수 속도가 곧 채무 상환 속도를 결정합니다.
          </p>
        </Prose>
      </Card>
    </ReportFrame>
  );
}
