import { requirePage } from "@/lib/server/auth";
import { getReportData } from "@/lib/server/report-data";
import { ReportFrame, H } from "@/components/report-frame";
import { Card, Grid, Note, Prose } from "@/components/ui";
import { BarsChart } from "@/components/charts";
import { fmtPct } from "@/lib/format";

// 정성평가 예시 지표 (1~5점) — 실측 통계가 아닌 평가 프레임 예시
const SCORES = [
  { name: "교통 접근성", score: 4, note: "광역 교통축 인접 가정" },
  { name: "배후 주거수요", score: 4, note: "인접 주거단지 배후수요 가정" },
  { name: "업무 수요", score: 3, note: "업무지구 형성 진행 단계 가정" },
  { name: "상권 성숙도", score: 2, note: "신규 개발지역으로 상권 형성 초기" },
  { name: "경쟁 공급 강도(역)", score: 2, note: "인근 유사 상품 공급 다수 가정" },
  { name: "가시성·동선", score: 3, note: "1층 가로변 노출, 상층부 동선 약함" },
];

export default async function LocationPage() {
  const user = await requirePage("report");
  const r = getReportData(user);
  const { meta, mode, lease, sale } = r;

  return (
    <ReportFrame code="A03" title="입지 및 상권분석" desc="사업지의 입지 특성과 상권 구조를 정성적으로 평가하고, 판매·임대 전략에 대한 시사점을 도출합니다." meta={meta} mode={mode}>
      <Note tone="warn">
        사업장 비식별 원칙에 따라 정확한 주소·인접 시설명·지역 통계는 표기하지 않습니다. 아래 점수와 지표는 <b>평가 프레임을 보여주기 위한 예시</b>이며 실측 통계가 아닙니다.
        실제 적용 시 공인 통계(인구·가구, 유동인구, 임대시세, 공급 예정물량)로 대체해야 합니다.
      </Note>

      <Grid cols={2}>
        <Card title="입지 개요">
          <Prose>
            <p>
              사업지는 <b>수도권 업무·주거 복합개발지역</b>에 위치하며, 업무시설과 공동주택이 혼재된 신규 개발축에 속합니다. 광역 교통 접근성은 양호한 편이나 지역 상권은
              형성 초기 단계로, 근린생활시설의 안정적 임차 수요가 아직 충분히 축적되지 않은 것으로 판단됩니다.
            </p>
            <ul>
              <li>주 수요층(오피스텔): 1~2인 직장인 가구, 소형 사무공간 수요, 임대수익형 투자자</li>
              <li>주 수요층(근생): 단지 입주민·인근 직장인의 생활밀착 소비, 의료·교육 등 목적형 방문</li>
              <li>제약요인: 인근 유사 상품 공급, 상층부 상가의 가시성·동선 한계, 금리 수준에 따른 투자수요 둔화</li>
            </ul>
          </Prose>
        </Card>
        <Card title="입지 정성평가 (예시 지표, 5점 척도)" sub="실측치 아님 — 평가 프레임 예시">
          <BarsChart data={SCORES} x="name" horizontal series={[{ key: "score", label: "평가점수" }]} height={240} />
        </Card>
      </Grid>

      <Card title="평가 항목별 근거 (예시)" pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>평가 항목</th>
              <th className="r">점수(예시)</th>
              <th>판단 근거(가정)</th>
              <th>시사점</th>
            </tr>
          </thead>
          <tbody>
            {SCORES.map((s) => (
              <tr key={s.name}>
                <td className="font-medium">{s.name}</td>
                <td className="r num">{s.score} / 5</td>
                <td className="!whitespace-normal">{s.note}</td>
                <td className="!whitespace-normal text-ink2">
                  {s.score >= 4 ? "판매 소구점으로 활용" : s.score === 3 ? "보완 전략 병행" : "가격·조건·MD로 약점 보완 필요"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Grid cols={2}>
        <Card title="SWOT 분석">
          <div className="grid grid-cols-2 gap-2 text-[12.5px]">
            {[
              ["강점 (S)", "border-good/40 bg-good-bg", ["준공 완료로 즉시 입주·임대 가능", "광역 교통 접근성", "소형 상품 구성으로 총액 부담 낮음"]],
              ["약점 (W)", "border-warn/40 bg-warn-bg", ["상권 형성 초기", "상층부 근생 가시성 한계", "할인분양에 따른 기존 계약자 형평성 이슈"]],
              ["기회 (O)", "border-teal/30 bg-teal-soft", ["주변 입주 진행에 따른 배후수요 증가", "앵커테넌트 유치 시 집객 효과", "임대 안정화 후 수익형 매각 가능"]],
              ["위협 (T)", "border-bad/30 bg-bad-bg", ["유사 상품 추가 공급", "금리·대출규제에 따른 수요 위축", "잔금 미납·해지 증가 가능성"]],
            ].map(([t, cls, items]) => (
              <div key={t as string} className={`rounded-md border p-2.5 ${cls}`}>
                <div className="mb-1 font-semibold text-ink">{t as string}</div>
                <ul className="space-y-0.5 text-ink2">
                  {(items as string[]).map((i) => (
                    <li key={i}>• {i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
        <Card title="현재 성과와의 연계" sub="본 사업 데이터(집계)">
          <BarsChart data={lease.byFloor} x="floor" kind="pct" series={[{ key: "rate", label: "층별 임대율" }]} height={200} />
          <Prose>
            <p>
              층별 임대율은 1층이 가장 높고 상층부로 갈수록 낮아지는 전형적인 신규 상권 패턴을 보입니다(전체 {fmtPct(lease.rate)}). 근린생활시설 분양률(
              {fmtPct(sale.retail.rate)})이 오피스텔({fmtPct(sale.officetel.rate)})보다 낮은 점도 상권 성숙도와 연관됩니다.
            </p>
          </Prose>
        </Card>
      </Grid>

      <Card title="상권분석 시사점">
        <H n="1">목적형 업종 중심의 상층부 MD</H>
        <Prose>
          <p>유동인구 의존도가 낮은 의료·교육·전문서비스 업종을 상층부에 배치하여 가시성 약점을 보완합니다.</p>
        </Prose>
        <H n="2">1층 생활밀착 업종으로 집객 기반 형성</H>
        <Prose>
          <p>입주민·직장인의 일상 소비를 흡수하는 업종으로 1층 공실을 최소화하고 상층부로의 동선을 유도합니다.</p>
        </Prose>
        <H n="3">임대 안정화 → 매각가치 제고</H>
        <Prose>
          <p>임차 완료 상가는 수익형 상품으로 재포지셔닝하여 할인 의존도를 낮추고 매각 단가를 방어합니다. 구체 전략은 A05에서 다룹니다.</p>
        </Prose>
      </Card>
    </ReportFrame>
  );
}
