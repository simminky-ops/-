import Link from "next/link";
import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { buildAlerts } from "@/lib/server/alerts";
import { cashHistorySeries, debtMix, endingCashSeries, receivableSeries, salesSeries } from "@/lib/server/series";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { KpiCard } from "@/components/kpi-card";
import { BarsChart, DonutChart, LinesChart } from "@/components/charts";
import { PeriodBars, PeriodCash, PeriodLines } from "@/components/period-charts";
import { Money } from "@/components/money";
import { PRIORITY_LABEL, RISK_STATUS_LABEL } from "@/lib/types";
import { canRead } from "@/lib/rbac";

export default async function DashboardPage() {
  const user = await requirePage("dashboard");
  const snap = getSnapshot();
  const { values, kpis, cf, data } = snap;
  const s = values.s;
  const alerts = buildAlerts(snap, user).slice(0, 8);
  const risks = data.risks.filter((r) => r.status !== "CLOSED" && r.priority === "HIGH" && (!r.confidential || canRead(user.role, "risks_confidential"))).slice(0, 6);
  const seeFinance = canRead(user.role, "cashflow");
  const seeRisks = canRead(user.role, "risks");
  const visibleKpis = seeFinance ? kpis : kpis.filter((k) => !["debt_balance", "repay_rate", "ending_cash"].includes(k.key));
  const base = cf.BASE;

  return (
    <div className="space-y-5">
      <PageHeader
        code="B01"
        title="통합 대시보드"
        desc={`기준일 ${data.settings.base_date} · 분양·수납·임대·채무·현금흐름 핵심지표. 카드의 ⓘ 아이콘에서 산식·원천데이터·계산범위를 확인할 수 있습니다.`}
        actions={
          <>
            <ButtonLink href="/reports/weekly">주간보고서</ButtonLink>
            <ButtonLink href="/reports/monthly_exec" variant="primary">
              월간 임원보고서
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {visibleKpis.map((k) => (
          <KpiCard key={k.key} k={k} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="월별 분양 및 재판매 실적" sub="계약 체결일 기준 · 조회기간(월간/분기/누적) 적용" className="xl:col-span-2">
          <PeriodBars
            data={salesSeries(snap)}
            x="period"
            flow={["newSale", "resale", "terminated"]}
            series={[
              { key: "newSale", label: "신규분양", stack: "a" },
              { key: "resale", label: "재판매", stack: "a" },
              { key: "terminated", label: "계약해지" },
            ]}
          />
        </Card>
        <Card title="오피스텔 vs 근린생활시설 분양률" sub="호실 수 기준">
          <BarsChart
            data={[
              { name: "오피스텔", rate: s.officetel.rate },
              { name: "근린생활시설", rate: s.retail.rate },
              { name: "전체", rate: s.saleRate },
            ]}
            x="name"
            kind="pct"
            series={[{ key: "rate", label: "분양률" }]}
            refLine={{ y: data.settings.targets.sale_rate ?? 90, label: "전체 목표" }}
            height={220}
          />
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink2">
            <div>
              오피스텔 {s.officetel.sold}/{s.officetel.total}호
            </div>
            <div>
              근생 {s.retail.sold}/{s.retail.total}호
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="층별 임대율" sub="근린생활시설 · 전용면적 기준">
          <BarsChart data={values.l.byFloor} x="floor" kind="pct" series={[{ key: "rate", label: "임대율" }]} refLine={{ y: data.settings.targets.lease_rate ?? 75, label: "목표" }} height={220} />
        </Card>
        <Card title="미수금 발생 및 회수 추이" sub="월말 연체원금·유예잔액 / 월중 잔금·유예금 회수" className="xl:col-span-2">
          <PeriodLines
            data={receivableSeries(snap)}
            x="month"
            flow={["collected"]}
            stock={["overdue", "deferred"]}
            series={[
              { key: "overdue", label: "연체원금(월말)" },
              { key: "deferred", label: "유예잔액(월말)" },
              { key: "collected", label: "회수액" },
            ]}
            height={220}
          />
        </Card>
      </div>

      {seeFinance && (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="월별 현금 유입·유출" sub="실적(기준월 이전) + 기준 시나리오 예측 12개월">
          <PeriodCash data={cashHistorySeries(snap)} minCash={data.settings.min_cash} />
        </Card>
        <Card
          title="향후 36개월 예상 현금잔액"
          sub={`${base.months[0]?.month} ~ ${base.months[base.months.length - 1]?.month} · 시나리오별 기말현금`}
          actions={<ButtonLink href="/cashflow">상세</ButtonLink>}
        >
          <LinesChart
            data={endingCashSeries(snap)}
            x="month"
            zeroLine
            series={[
              { key: "CONS", label: "보수적" },
              { key: "BASE", label: "기준" },
              { key: "OPT", label: "낙관적" },
            ]}
          />
          {base.summary.shortageMonths.length > 0 && (
            <p className="mt-2 text-xs text-bad">
              ■ 기준 시나리오 현금부족 {base.summary.shortageMonths.length}개월 · 최소 필요자금 <Money v={base.summary.requiredFunding} />
            </p>
          )}
        </Card>
      </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {seeFinance && (
        <Card title="채무 유형별 구성비" sub="잔액 기준(원금+이자·가산금−상환)">
          <DonutChart data={debtMix(snap)} />
        </Card>
        )}
        <Card title="주요 업무 및 기한" actions={<ButtonLink href="/alerts">전체</ButtonLink>}>
          <ul className="divide-y divide-line text-[13px]">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5">
                <Badge tone={a.level === "critical" ? "bad" : "warn"}>{a.level === "critical" ? "■ 긴급" : a.level === "serious" ? "◆ 중요" : "▲ 주의"}</Badge>
                <Link href={a.link} className="flex-1 truncate hover:text-teal">
                  {a.title}
                </Link>
                {a.dday !== null && <span className="num text-xs text-ink3">{a.dday >= 0 ? `D-${a.dday}` : `D+${-a.dday}`}</span>}
              </li>
            ))}
            {!alerts.length && <li className="py-4 text-center text-ink3">기한 도래 업무가 없습니다.</li>}
          </ul>
        </Card>
        {seeRisks && (
        <Card title="주요 리스크 (우선순위 상)" actions={<ButtonLink href="/risks">전체</ButtonLink>}>
          <ul className="divide-y divide-line text-[13px]">
            {risks.map((r) => (
              <li key={r.id} className="py-1.5">
                <div className="flex items-center gap-2">
                  <Badge tone="bad">■ {PRIORITY_LABEL[r.priority]}</Badge>
                  <span className="flex-1 truncate font-medium">{r.title}</span>
                </div>
                <div className="mt-0.5 flex gap-3 text-xs text-ink3">
                  <span>{RISK_STATUS_LABEL[r.status]}</span>
                  <span>다음조치 {r.next_action_date ?? "-"}</span>
                  {r.expected_cost > 0 && (
                    <span>
                      예상비용 <Money v={r.expected_cost} />
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        )}
      </div>
    </div>
  );
}
