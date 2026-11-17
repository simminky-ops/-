"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { RefreshCw, Save } from "lucide-react";
import type { CashflowResult, InLine, OutLine } from "@/lib/calc/cashflow";
import { IN_LABEL, IN_LINES, OUT_LABEL, OUT_LINES } from "@/lib/calc/cashflow";
import { SCENARIO_FIELDS } from "@/lib/calc/scenarioDefaults";
import type { ScenarioAssumptions, ScenarioKey } from "@/lib/types";
import { DEBT_TYPE_LABEL } from "@/lib/types";
import { fmtMoney, fmtNum } from "@/lib/format";
import { Badge, Card, Note, Stat } from "./ui";
import { CashComboChart, LinesChart, BarsChart } from "./charts";
import { Money } from "./money";
import { usePrefs } from "./providers";
import { DataTable } from "./data-table";
import { EntityManager } from "./entity-manager";

const SC: ScenarioKey[] = ["CONS", "BASE", "OPT"];
const SC_LABEL: Record<ScenarioKey, string> = { CONS: "보수적", BASE: "기준", OPT: "낙관적" };

type DebtRow = Record<string, unknown>;

export function CashflowWorkbench(props: {
  initial: Record<ScenarioKey, CashflowResult>;
  feasProfit: Record<ScenarioKey, number>;
  feasDiscount: Record<ScenarioKey, number>;
  scenarios: Record<ScenarioKey, ScenarioAssumptions>;
  startMonth: string;
  months: number;
  openingCash: number;
  openingMonth: string;
  minCash: number;
  baseDate: string;
  canEdit: boolean;
  debtRows: DebtRow[];
  initialTab: string;
}) {
  const router = useRouter();
  const { unit } = usePrefs();
  const [tab, setTab] = useState(props.initialTab);
  const [scenario, setScenario] = useState<ScenarioKey>("BASE");
  const [assump, setAssump] = useState(props.scenarios);
  const [start, setStart] = useState(props.startMonth);
  const [count, setCount] = useState(props.months);
  const [results, setResults] = useState(props.initial);
  const [profit, setProfit] = useState(props.feasProfit);
  const [discount, setDiscount] = useState(props.feasDiscount);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [detailMonth, setDetailMonth] = useState<string | null>(null);

  const cf = results[scenario];
  const s = cf.summary;
  const m = (v: number) => fmtMoney(v, unit, false);

  async function recalc() {
    setBusy(true);
    setMsg("");
    const out = { ...results };
    const p = { ...profit };
    const d = { ...discount };
    for (const k of SC) {
      const r = await fetch("/api/cashflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: k, startMonth: start, months: count, assumptions: assump[k] }) });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.error);
        setBusy(false);
        return;
      }
      out[k] = j.cf;
      p[k] = j.feas.profit;
      d[k] = j.feas.discountLoss;
    }
    setResults(out);
    setProfit(p);
    setDiscount(d);
    setBusy(false);
    setDirty(false);
    setMsg("재계산 완료 (저장되지 않은 가정입니다 — '가정 저장' 시 전 화면에 반영)");
  }

  async function saveAssumptions() {
    setBusy(true);
    const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarios: assump, cashflow_start: start, cashflow_months: count }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) setMsg(`${j.error}${j.details ? ": " + j.details.join(", ") : ""}`);
    else {
      setMsg("시나리오 가정과 조회기간이 저장되었습니다. 대시보드·사업수지·보고서에 반영됩니다.");
      router.refresh();
    }
  }

  const chartRows = cf.months.map((x) => ({ month: x.month, inflow: x.inTotal, outflow: x.outTotal, ending: x.ending }));
  const cumRows = cf.months.reduce<{ month: string; cum: number; ending: number }[]>((acc, x) => {
    acc.push({ month: x.month, cum: (acc[acc.length - 1]?.cum ?? 0) + x.net, ending: x.ending });
    return acc;
  }, []);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <div className="flex rounded-md border border-line p-0.5">
          {[
            ["flow", "월별 현금흐름"],
            ["scenario", "시나리오 비교"],
            ["debts", "채무·상환계획"],
            ["input", "실적·예상 입력"],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={clsx("rounded px-3 py-1 text-[13px]", tab === k ? "bg-navy text-white" : "text-ink2 hover:bg-bg2")}>
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            시나리오
            <select className="input !w-auto !py-1" value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioKey)}>
              {SC.map((k) => (
                <option key={k} value={k}>
                  {SC_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            시작월
            <input type="month" className="input !w-[130px] !py-1" value={start} onChange={(e) => (setStart(e.target.value), setDirty(true))} />
          </label>
          <label className="flex items-center gap-1">
            기간
            <select className="input !w-auto !py-1" value={count} onChange={(e) => (setCount(Number(e.target.value)), setDirty(true))}>
              {[12, 24, 36, 48, 60].map((n) => (
                <option key={n} value={n}>
                  {n}개월
                </option>
              ))}
            </select>
          </label>
          <button onClick={recalc} disabled={busy} className={clsx("inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium", dirty ? "bg-teal text-white" : "border border-line bg-white")}>
            <RefreshCw className={clsx("h-3.5 w-3.5", busy && "animate-spin")} /> 재계산
          </button>
          {props.canEdit && (
            <button onClick={saveAssumptions} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 font-medium text-white">
              <Save className="h-3.5 w-3.5" /> 가정 저장
            </button>
          )}
        </div>
      </div>
      {msg && <Note>{msg}</Note>}
      {cf.warnings.length > 0 && (
        <Note tone="warn">
          {cf.warnings.map((w, i) => (
            <div key={i}>▲ {w}</div>
          ))}
        </Note>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label={`기초현금 (${cf.months[0]?.month})`} value={<Money v={cf.startOpening} />} />
        <Stat label="기간 말 기말현금" value={<Money v={s.endingCash} />} tone={s.endingCash < 0 ? "bad" : undefined} />
        <Stat label="최저 기말현금" value={<Money v={s.minEnding} />} sub={s.minEndingMonth ?? ""} tone={s.minEnding < 0 ? "bad" : s.minEnding < props.minCash ? "warn" : "good"} />
        <Stat label="현금부족 월수" value={`${s.shortageMonths.length}개월`} sub={s.shortageMonths.slice(0, 3).join(", ")} tone={s.shortageMonths.length ? "bad" : "good"} />
        <Stat label="자금부족 최소 필요액" value={<Money v={s.requiredFunding} />} sub={<>최소보유현금 유지 시 <Money v={s.requiredFundingMinCash} /></>} tone={s.requiredFunding > 0 ? "bad" : undefined} />
        <Stat label="채무 상환완료 예상" value={s.debtPayoffMonth ?? "기간 내 미완료"} sub={<>기간말 잔액 <Money v={s.debtBalanceEnd} /></>} tone={s.debtPayoffMonth ? "good" : "warn"} />
        <Stat label="미분양 판매(가정)" value={`${s.newSalesUnits}호`} sub={<>계약액 <Money v={s.newSalesRevenue} /></>} />
        <Stat label="예상 사업손익" value={<Money v={profit[scenario]} />} sub="B06 사업수지 연동" tone={profit[scenario] < 0 ? "bad" : "good"} />
      </div>

      {tab === "flow" && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title={`월별 현금 유입·유출 및 기말현금 — ${SC_LABEL[scenario]} 시나리오`} className="xl:col-span-2">
              <CashComboChart data={chartRows} minCash={props.minCash} height={300} />
            </Card>
            <Card title="누적 순현금흐름" sub="시작월 이후 순현금 누계 vs 기말현금">
              <LinesChart
                data={cumRows}
                x="month"
                zeroLine
                height={300}
                series={[
                  { key: "cum", label: "누적 순현금흐름" },
                  { key: "ending", label: "기말현금" },
                ]}
              />
            </Card>
          </div>
          <Card title="월별 현금흐름표" sub={`단위: ${{ WON: "원", MAN: "만원", EOK: "억원" }[unit]} · 실=실적, 예=예측 · 기말현금 음수 월은 빨간색 · 월을 클릭하면 계정별 상세내역`} pad={false}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[#f7f9fb]">구분</th>
                    {cf.months.map((x) => (
                      <th key={x.month} className={clsx("r cursor-pointer", x.ending < 0 && "!text-bad")} onClick={() => setDetailMonth(x.month)}>
                        {x.month}
                        <span className="ml-1 text-[10px] font-normal text-ink3">{x.kind === "ACTUAL" ? "실" : "예"}</span>
                      </th>
                    ))}
                    <th className="r">합계</th>
                  </tr>
                </thead>
                <tbody>
                  <Row label="기초현금" bold vals={cf.months.map((x) => x.opening)} m={m} noSum />
                  {(IN_LINES as readonly InLine[]).map((k) => (
                    <Row key={k} label={`(+) ${IN_LABEL[k]}`} vals={cf.months.map((x) => x.in[k])} m={m} />
                  ))}
                  <Row label="현금유입 계" bold tone="in" vals={cf.months.map((x) => x.inTotal)} m={m} />
                  {(OUT_LINES as readonly OutLine[]).map((k) => (
                    <Row key={k} label={`(−) ${OUT_LABEL[k]}`} vals={cf.months.map((x) => x.out[k])} m={m} />
                  ))}
                  <Row label="현금유출 계" bold tone="out" vals={cf.months.map((x) => x.outTotal)} m={m} />
                  <Row label="순현금흐름" bold vals={cf.months.map((x) => x.net)} m={m} />
                  <Row label="기말현금" bold tone="end" vals={cf.months.map((x) => x.ending)} m={m} noSum />
                  <Row label="참고: 신규판매 계약액(발생)" muted vals={cf.months.map((x) => x.newRevenue)} m={m} />
                  <Row label="참고: 채무 상환액" muted vals={cf.months.map((x) => x.debtPrincipalPaid)} m={m} />
                  <Row label="참고: 기말 채무잔액" muted vals={cf.months.map((x) => x.debtBalanceEnd)} m={m} noSum />
                </tbody>
              </table>
            </div>
          </Card>
          {detailMonth && (
            <Card title={`${detailMonth} 계정별 상세내역 (${SC_LABEL[scenario]})`} actions={<button onClick={() => setDetailMonth(null)} className="text-xs text-ink3">닫기</button>}>
              <DataTable
                rows={(cf.months.find((x) => x.month === detailMonth)?.details ?? []).map((d, i) => ({ id: i, ...d, lineLabel: (IN_LABEL as Record<string, string>)[d.line] ?? (OUT_LABEL as Record<string, string>)[d.line] }))}
                cols={[
                  { key: "lineLabel", label: "계정" },
                  { key: "label", label: "내역" },
                  { key: "amount", label: "금액(+유입/−유출)", kind: "money", sum: true },
                ]}
                pageSize={100}
                emptyText="자동 산출 상세내역이 없습니다 (실적월은 원천 데이터 기준 집계)."
              />
              <p className="mt-2 text-[11px] text-ink3">운영비·광고비 등 월 고정 가정과 실적월 집계는 상세내역에 개별 표시되지 않습니다.</p>
            </Card>
          )}
        </>
      )}

      {tab === "scenario" && (
        <>
          <Card title="시나리오별 비교" sub="보수적: 분양 둔화·할인 확대·회수 지연·임대 지연 / 기준: 사업계획 / 낙관적: 분양 가속·할인 축소·조기 회수·임대율 상승">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>항목</th>
                    {SC.map((k) => (
                      <th key={k} className="r">
                        {SC_LABEL[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["누적 분양매출(신규판매 계약액)", (k: ScenarioKey) => m(results[k].summary.newSalesRevenue)],
                    ["신규판매 호실 수", (k: ScenarioKey) => `${results[k].summary.newSalesUnits}호 (잔여 ${results[k].summary.unsoldUnitsEnd}호)`],
                    ["총 할인손실(기존+신규)", (k: ScenarioKey) => m(discount[k])],
                    ["누적 현금회수(분양 관련)", (k: ScenarioKey) => m(results[k].summary.salesCollections)],
                    ["기간 말 미수금 잔액", (k: ScenarioKey) => m(results[k].summary.receivableEnd)],
                    ["회수율 가정상 미회수", (k: ScenarioKey) => m(results[k].summary.uncollectible)],
                    ["기간 말 채무잔액", (k: ScenarioKey) => m(results[k].summary.debtBalanceEnd)],
                    ["최저 기말현금 (월)", (k: ScenarioKey) => `${m(results[k].summary.minEnding)} (${results[k].summary.minEndingMonth ?? "-"})`],
                    ["현금부족 월수 / 최소 필요자금", (k: ScenarioKey) => `${results[k].summary.shortageMonths.length}개월 / ${m(results[k].summary.requiredFunding)}`],
                    ["기간 말 기말현금", (k: ScenarioKey) => m(results[k].summary.endingCash)],
                    ["예상 사업손익", (k: ScenarioKey) => m(profit[k])],
                    ["채무 상환완료 예상시점", (k: ScenarioKey) => results[k].summary.debtPayoffMonth ?? "기간 내 미완료"],
                  ].map(([label, f]) => (
                    <tr key={label as string}>
                      <td className="font-medium">{label as string}</td>
                      {SC.map((k) => (
                        <td key={k} className="r num">
                          {(f as (k: ScenarioKey) => string)(k)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="시나리오별 기말현금 추이">
              <LinesChart
                data={results.BASE.months.map((x, i) => ({ month: x.month, CONS: results.CONS.months[i]?.ending, BASE: x.ending, OPT: results.OPT.months[i]?.ending }))}
                x="month"
                zeroLine
                series={SC.map((k) => ({ key: k, label: SC_LABEL[k] }))}
              />
            </Card>
            <Card title="시나리오별 채무잔액 추이">
              <LinesChart
                data={results.BASE.months.map((x, i) => ({ month: x.month, CONS: results.CONS.months[i]?.debtBalanceEnd, BASE: x.debtBalanceEnd, OPT: results.OPT.months[i]?.debtBalanceEnd }))}
                x="month"
                series={SC.map((k) => ({ key: k, label: SC_LABEL[k] }))}
              />
            </Card>
          </div>
          <Card title="시나리오 가정 (모든 가정은 직접 변경 가능)" sub="값 변경 후 '재계산' → 결과 확인 → '가정 저장'으로 확정">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>가정</th>
                    <th>단위</th>
                    {SC.map((k) => (
                      <th key={k} className="r">
                        {SC_LABEL[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SCENARIO_FIELDS.map((f) => (
                    <tr key={f.key}>
                      <td>{f.label}</td>
                      <td className="text-ink3">{f.unit}</td>
                      {SC.map((k) => (
                        <td key={k} className="r">
                          <input
                            type="number"
                            step={f.step}
                            className="input num !w-32 text-right"
                            value={assump[k][f.key] as number}
                            onChange={(e) => {
                              setAssump({ ...assump, [k]: { ...assump[k], [f.key]: Number(e.target.value) } });
                              setDirty(true);
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td>잉여현금 우선순위 자동상환</td>
                    <td className="text-ink3">여부</td>
                    {SC.map((k) => (
                      <td key={k} className="r">
                        <input
                          type="checkbox"
                          checked={assump[k].autoRepay}
                          onChange={(e) => {
                            setAssump({ ...assump, [k]: { ...assump[k], autoRepay: e.target.checked } });
                            setDirty(true);
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {!props.canEdit && <p className="mt-2 text-xs text-ink3">조회 권한: 가정을 바꿔 재계산해 볼 수 있으나 저장은 PM·재무 담당자만 가능합니다.</p>}
          </Card>
        </>
      )}

      {tab === "debts" && (
        <>
          <Card title="국세·지방세·공사비·금융비 채무 현황" sub="상환우선순위는 계약상 지급순위·신탁/금융약정·법률상 의무·당사자 동의조건에 따라 관리자가 설정하며, 변경 시 경영진 승인이 필요합니다.">
            <DataTable
              rows={props.debtRows}
              cols={[
                { key: "priority", label: "순위", kind: "num" },
                { key: "id", label: "채무 ID" },
                { key: "type_label", label: "채무유형" },
                { key: "creditor", label: "채권자" },
                { key: "principal", label: "발생원금", kind: "money", sum: true },
                { key: "interest_penalty", label: "이자·가산금", kind: "money", sum: true },
                { key: "repaid", label: "기상환액", kind: "money", sum: true },
                { key: "remaining", label: "잔여(원금+가산)", kind: "money", sum: true },
                { key: "planned", label: "상환계획(기준월~)", kind: "money", sum: true },
                { key: "unplanned", label: "계획 미수립", kind: "money", sum: true },
                { key: "due_date", label: "납부기한", kind: "date" },
                { key: "installment_status", label: "분납협의", map: { NONE: "해당없음", NEGOTIATING: "협의중", AGREED: "분납합의" }, tone: { NONE: "neutral", NEGOTIATING: "warn", AGREED: "good" } },
                { key: "overdue", label: "연체", tone: { 연체: "bad" } },
                { key: "payoff", label: "완제 예상(기준)" },
                { key: "negotiator", label: "협의 담당" },
              ]}
              pageSize={50}
            />
          </Card>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title={`채무별 상환일정 — ${SC_LABEL[scenario]} 시나리오`} sub="상환계획 + 잉여현금 우선상환 (수입 연동)">
              <BarsChart
                data={cf.months.map((x) => {
                  const row: Record<string, unknown> = { month: x.month };
                  for (const t of Object.keys(DEBT_TYPE_LABEL)) row[t] = 0;
                  for (const d of x.details) {
                    if (d.amount >= 0 || d.label.includes("이자")) continue;
                    const dr = props.debtRows.find((r) => d.label.startsWith(`${r.id} `));
                    if (dr) {
                      const t = dr.debt_type === "OPEX" ? "OTHER" : (dr.debt_type as string);
                      row[t] = (row[t] as number) - d.amount;
                    }
                  }
                  return row;
                })}
                x="month"
                kind="money"
                series={[
                  { key: "NATIONAL_TAX", label: "국세", stack: "d" },
                  { key: "LOCAL_TAX", label: "지방세", stack: "d" },
                  { key: "FINANCE", label: "금융원리금", stack: "d" },
                  { key: "CONSTRUCTION", label: "공사비", stack: "d" },
                  { key: "OTHER", label: "기타·운영비", stack: "d" },
                ]}
              />
            </Card>
            <Card title="채무별 기간 말 잔액">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>채무</th>
                    <th className="r">시작 잔액</th>
                    <th className="r">기간 중 상환</th>
                    <th className="r">기간 말 잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {cf.debtEnd.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.id} {DEBT_TYPE_LABEL[d.type]} <span className="text-ink3">({d.creditor})</span>
                      </td>
                      <td className="r num">{m(d.start)}</td>
                      <td className="r num">{m(d.paid)}</td>
                      <td className={clsx("r num font-semibold", d.end > 0 && "text-bad")}>{m(d.end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
          <Card title="채무 원장 관리">
            <EntityManager entity="debts" canWrite={props.canEdit} />
          </Card>
          <Card title="상환계획·상환실적 입력" sub="PLAN=월별 상환계획, ACTUAL=실제 상환(기준월 이전 실적은 현금흐름 실적에 자동 반영)">
            <EntityManager entity="debt_repayments" canWrite={props.canEdit} compact />
          </Card>
        </>
      )}

      {tab === "input" && (
        <>
          <Note>
            수납(계약금·중도금·잔금·유예금)과 채무 상환실적은 각 원장에서 <b>자동 집계</b>됩니다. 여기에서는 그 외 계정(임대수입, 운영비, 판매·광고비, 금융이자, 법률·하자 등)의 월별 실적과, 엔진이 산출하지 못하는 예상 항목만 입력하세요 (중복 집계 방지).
          </Note>
          <Card title="월별 현금흐름 실적 (수기 계정)">
            <EntityManager entity="cashflow_actuals" canWrite={props.canEdit} compact />
          </Card>
          <Card title="월별 현금흐름 예상 (수기 항목)" sub="시나리오별 또는 전체 적용">
            <EntityManager entity="cashflow_forecasts" canWrite={props.canEdit} compact />
          </Card>
          <Card title="계산 기준">
            <ul className="space-y-1 text-xs text-ink2">
              <li>• 기초현금: {props.openingMonth} 기초 {fmtMoney(props.openingCash, unit)} (설정값) → 실적월 순현금 누적으로 시작월 기초현금 산출</li>
              <li>• 기준일 {props.baseDate}: 기준월 이전 = 실적, 기준월부터 = 예측 (기준월 당월 기수납·기상환 실적 포함)</li>
              <li>• 예상 계약액과 실제 현금 수납액 구분: 신규판매는 계약월 계약금, 잔금월 잔금, 유예만기월 유예금으로 분리 유입</li>
              <li>• 기존 미수: 납부약정(회수예정) → 약정월, 미정 연체분 → 회수율×분산기간, 유예금 → 만기월</li>
              <li>• 금융이자: 잔여원금 × 적용이율 ÷ 12 (예측월)</li>
              <li>• 자동상환: 최소보유현금 {fmtMoney(props.minCash, unit)} + 향후 3개월 상환계획 유보 후 잉여현금을 우선순위대로 상환</li>
              <li>• 표시 수치 {fmtNum(cf.months.length)}개월 · 예시 데이터 기반</li>
            </ul>
          </Card>
        </>
      )}
      <div className="flex flex-wrap gap-2 text-[11px] text-ink3">
        <Badge>실 = 실적월</Badge>
        <Badge>예 = 예측월</Badge>
        <Badge tone="bad">■ 빨간 월 = 기말현금 부족</Badge>
      </div>
    </div>
  );
}

function Row({ label, vals, m, bold, tone, muted, noSum }: { label: string; vals: number[]; m: (v: number) => string; bold?: boolean; tone?: "in" | "out" | "end"; muted?: boolean; noSum?: boolean }) {
  const total = vals.reduce((a, b) => a + b, 0);
  return (
    <tr className={clsx(bold && "font-semibold", tone === "end" && "bg-[#f3f8fa]", muted && "text-ink3")}>
      <td className={clsx("sticky left-0 z-[1] bg-white", tone === "end" && "!bg-[#f3f8fa]")}>{label}</td>
      {vals.map((v, i) => (
        <td key={i} className={clsx("r num", tone === "end" && v < 0 && "!bg-bad-bg font-bold text-bad", v === 0 && !bold && "text-ink3/60")}>
          {v === 0 && !bold ? "-" : m(v)}
        </td>
      ))}
      <td className="r num">{noSum ? "" : m(total)}</td>
    </tr>
  );
}

