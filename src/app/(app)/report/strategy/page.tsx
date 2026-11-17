import Link from "next/link";
import { requirePage } from "@/lib/server/auth";
import { getReportData } from "@/lib/server/report-data";
import { ReportFrame, H } from "@/components/report-frame";
import { Amt } from "@/components/report-ui";
import { Badge, Card, Grid, Note, Prose } from "@/components/ui";
import { BarsChart } from "@/components/charts";
import { fmtNum, fmtPct } from "@/lib/format";

const MD = [
  { floor: "1층", focus: "생활밀착형", industries: "생활밀착형 음식점, 간편식·베이커리, 편의서비스, 프랜차이즈, 약국·세탁 등 생활편의", role: "집객 기반·가로 활성화", check: "급배기·주방 설비, 영업신고 가능 용도, 가로 노출" },
  { floor: "2층", focus: "체류형 F&B", industries: "카페(앵커 후보), 외식업, 디저트, 브런치, 체류형 서비스", role: "상층부 동선 유도", check: "전용 출입·계단/승강기 동선, 하중·배관, 테라스 활용" },
  { floor: "3층 이상", focus: "목적형", industries: "의원(앵커 후보), 교육(학원), 전문서비스(세무·법무), 미용·피트니스 등 생활서비스", role: "가시성 의존도 낮은 수요 확보", check: "의료시설 설치기준·교육시설 용도 적합성, 소음·진동, 주차" },
];

export default async function StrategyPage() {
  const user = await requirePage("report");
  const r = getReportData(user);
  const { meta, mode, sale, lease, scenarios, policies } = r;

  return (
    <ReportFrame code="A05" title="판매 및 임대 활성화 전략" desc="미분양 판매·재판매 활성화와 근린생활시설 임대·MD 최적화 전략을 제시합니다." meta={meta} mode={mode}>
      <Card title="1. 판매 활성화 전략">
        <H n="1-1">판매조건 다변화 — 할인과 잔금유예의 균형</H>
        <Prose>
          <p>
            할인은 즉시 판매를 촉진하지만 손실이 확정되고 기존 계약자 형평성 문제를 유발합니다. 잔금유예는 할인손실을 줄이는 대신 회수기간이 길어지고 금융비용이 발생합니다.
            따라서 <b>호실 특성(층·향·면적)별로 할인율과 유예조건을 차등 적용</b>하고, 조건별 손익·회수기간을 사전에 비교하여 승인된 조건만 적용합니다.
          </p>
        </Prose>
        <div className="mt-3 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>판매조건(정책)</th>
                <th className="r">할인율</th>
                <th className="r">계약금</th>
                <th className="r">잔금</th>
                <th className="r">잔금유예</th>
                <th className="r">유예기간</th>
                <th className="r">분양대행수수료</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.name}>
                  <td className="font-medium">{p.name}</td>
                  <td className="r num">{fmtPct(p.discount, 0)}</td>
                  <td className="r num">{fmtPct(p.deposit, 0)}</td>
                  <td className="r num">{fmtPct(p.balance, 0)}</td>
                  <td className="r num">{fmtPct(p.deferral, 0)}</td>
                  <td className="r num">{p.deferralMonths}개월</td>
                  <td className="r num">{fmtPct(p.agency, 1)}</td>
                  <td>
                    <Badge tone={p.status === "APPROVED" ? "good" : "neutral"}>{p.status === "APPROVED" ? "승인" : p.status === "DRAFT" ? "검토" : "폐지"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!r.external && (
          <p className="no-print mt-2 text-xs text-ink3">
            조건별 매출·할인손실·초기 회수액·유예금 회수·금융비용·손익·회수기간 비교는{" "}
            <Link href="/feasibility" className="text-teal underline">
              B06 판매조건 시뮬레이터
            </Link>
            에서 확인합니다.
          </p>
        )}

        <H n="1-2">재판매 관리</H>
        <Prose>
          <ul>
            <li>잔금 장기미납 세대는 납부약정 → 최고장 → 해지 검토의 단계별 절차를 적용하고, 해지 시 정산(위약금·환급)과 동시에 재판매 대상으로 전환합니다.</li>
            <li>해지·재판매 시에도 원 계약과 수납 이력은 보존되며(이력형 관리), 재판매 조건은 직전 계약 대비 할인 폭을 승인받아 적용합니다.</li>
            <li>현재 해지 누계 {sale.terminatedCount}건, 재판매 {sale.resaleCount}건 — 해지 물량의 조기 재판매가 재고 증가를 억제하는 핵심입니다.</li>
          </ul>
        </Prose>

        <H n="1-3">영업 채널 및 운영</H>
        <Prose>
          <ul>
            <li>현장방문·온라인·중개법인 채널별 유입 대비 계약전환율을 관리하고, 성과가 낮은 채널의 광고비를 재배분합니다.</li>
            <li>임대 완료 호실은 &lsquo;수익형 상품&rsquo;으로, 공실 호실은 &lsquo;실사용(자가 영업)&rsquo; 수요로 구분하여 영업 메시지를 차별화합니다.</li>
            <li>영업 담당자별 상담→방문→조건제시→계약 단계 관리와 다음 상담일 관리로 이탈을 줄입니다.</li>
          </ul>
        </Prose>
      </Card>

      <Card title="시나리오별 판매 가정" pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>가정</th>
                {scenarios.map((s) => (
                  <th key={s.key} className="r">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>오피스텔 월 판매</td>
                {scenarios.map((s) => (
                  <td key={s.key} className="r num">
                    {fmtNum(s.assumptions.officetelUnitsPerMonth, 1)}호
                  </td>
                ))}
              </tr>
              <tr>
                <td>근생 월 판매</td>
                {scenarios.map((s) => (
                  <td key={s.key} className="r num">
                    {fmtNum(s.assumptions.retailUnitsPerMonth, 2)}호
                  </td>
                ))}
              </tr>
              <tr>
                <td>판매 개시 지연</td>
                {scenarios.map((s) => (
                  <td key={s.key} className="r num">
                    {s.assumptions.salesStartDelay}개월
                  </td>
                ))}
              </tr>
              <tr>
                <td>신규판매 할인율</td>
                {scenarios.map((s) => (
                  <td key={s.key} className="r num">
                    {fmtPct(s.assumptions.discountRate, 0)}
                  </td>
                ))}
              </tr>
              <tr>
                <td>잔금유예(공급가 대비) / 기간</td>
                {scenarios.map((s) => (
                  <td key={s.key} className="r num">
                    {fmtPct(s.assumptions.deferralRate, 0)} / {s.assumptions.deferralMonths}개월
                  </td>
                ))}
              </tr>
              <tr>
                <td>보유 공실 신규임대</td>
                {scenarios.map((s) => (
                  <td key={s.key} className="r num">
                    {fmtNum(s.assumptions.leaseUpSqmPerMonth)}㎡/월
                  </td>
                ))}
              </tr>
              <tr className="font-semibold">
                <td>검토기간 판매(호) / 판매예정액</td>
                {scenarios.map((s) => (
                  <td key={s.key} className="r">
                    {s.summary.newSalesUnits}호 / <Amt v={s.summary.newSalesRevenue} mode={mode} />
                  </td>
                ))}
              </tr>
              <tr>
                <td>신규판매 할인손실</td>
                {scenarios.map((s) => (
                  <td key={s.key} className="r">
                    <Amt v={s.summary.newSalesDiscount} mode={mode} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="2. 임대 활성화 및 MD 전략">
        <Note tone="warn">
          아래 층별 업종 구성은 <b>초기 MD 가설</b>입니다. 실제 업종 적합성은 건축물 <b>법적 용도</b>(제1·2종 근린생활시설 허용 업종), <b>설비</b>(급배기·전기용량·급배수), 배후
          <b> 수요</b>, 인근 <b>경쟁환경</b>을 분석하여 확정합니다.
        </Note>
        <div className="mt-3 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>층</th>
                <th>MD 콘셉트</th>
                <th>추천 업종(가설)</th>
                <th>역할</th>
                <th>검증 항목</th>
              </tr>
            </thead>
            <tbody>
              {MD.map((m) => (
                <tr key={m.floor}>
                  <td className="font-semibold">{m.floor}</td>
                  <td>{m.focus}</td>
                  <td className="!whitespace-normal">{m.industries}</td>
                  <td className="!whitespace-normal">{m.role}</td>
                  <td className="!whitespace-normal text-ink2">{m.check}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Grid cols={2} className="mt-4">
          <div>
            <div className="mb-1 text-xs font-semibold text-ink2">현재 층별 임대율</div>
            <BarsChart data={lease.byFloor} x="floor" kind="pct" series={[{ key: "rate", label: "임대율" }]} height={200} />
          </div>
          <Prose>
            <H n="2-1">앵커테넌트 유치</H>
            <p>2층 대형 카페, 3층 의원 등 앵커를 우선 유치하여 상층부 집객을 확보합니다(현재 앵커 {lease.anchors}개). 앵커에는 렌트프리·인테리어 지원을 조건부로 제공합니다.</p>
            <H n="2-2">임차인 지원조건 관리</H>
            <p>렌트프리 기간·지원금은 임대수익 및 매각가치에 미치는 영향을 비교해 승인 범위 내에서 운영합니다.</p>
            <H n="2-3">임대수익 귀속 구분</H>
            <p>사업시행법인 보유분의 임대수입만 사업 현금흐름에 반영하며, 개별 소유자 호실은 MD 관리 대상으로만 관리합니다.</p>
          </Prose>
        </Grid>
      </Card>

      <Card title="3. 판매·임대 연계 전략">
        <Prose>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <b>임대 선행 → 수익형 매각</b>: 근생 공실은 우선 임차인을 확보한 뒤 임대수익률 기반으로 매각하여 할인 의존도를 낮춥니다.
            </li>
            <li>
              <b>재고 구분 판매</b>: 오피스텔 잔여 재고는 층·향별 가격 차등과 한시적 조건으로 소진하고, 근생은 앵커 유치 이후 판매를 본격화합니다.
            </li>
            <li>
              <b>성과 모니터링</b>: 월간 분양률·임대율·계약전환율을 목표와 비교하고 시나리오 가정을 분기별로 재설정합니다.
            </li>
          </ol>
        </Prose>
      </Card>
    </ReportFrame>
  );
}
