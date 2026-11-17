"use client";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import type { FeasibilityResult } from "@/lib/calc/feasibility";
import type { CashflowResult } from "@/lib/calc/cashflow";
import type { SalesPolicy, ScenarioAssumptions, ScenarioKey } from "@/lib/types";
import { SIM_DEFAULT, SIM_PRESETS, simulate, validateSim, type SimInput } from "@/lib/calc/simulator";
import { fmtMoney, fmtNum, ratio } from "@/lib/format";
import { Card, Note, Stat } from "./ui";
import { BarsChart, LinesChart } from "./charts";
import { Money } from "./money";
import { usePrefs } from "./providers";
import { EntityManager } from "./entity-manager";

const SC_LABEL: Record<ScenarioKey, string> = { CONS: "보수적", BASE: "기준", OPT: "낙관적" };

export function FeasibilityView(props: {
  feas: Record<ScenarioKey, FeasibilityResult>;
  cfSummary: Record<ScenarioKey, CashflowResult["summary"]>;
  assumptions: Record<ScenarioKey, ScenarioAssumptions>;
  unsold: { officetel: { count: number; avgList: number }; retail: { count: number; avgList: number } };
  fundingRate: number;
  policies: SalesPolicy[];
  canWritePolicy: boolean;
}) {
  const [tab, setTab] = useState("pl");
  const [sc, setSc] = useState<ScenarioKey>("BASE");
  const { unit } = usePrefs();
  const m = (v: number) => fmtMoney(v, unit, false);
  const f = props.feas[sc];
  const executed = f.costs.reduce((s, r) => s + r.executed, 0);
  const unpaid = f.costs.reduce((s, r) => s + r.unpaid, 0);
  const future = f.costs.reduce((s, r) => s + r.future, 0);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <div className="flex rounded-md border border-line p-0.5">
          {[
            ["pl", "사업수지(손익)"],
            ["sim", "판매조건 시뮬레이터"],
            ["policy", "판매조건 정책"],
            ["expense", "사업비 원장"],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={clsx("rounded px-3 py-1 text-[13px]", tab === k ? "bg-navy text-white" : "text-ink2 hover:bg-bg2")}>
              {l}
            </button>
          ))}
        </div>
        {tab === "pl" && (
          <label className="ml-auto flex items-center gap-1 text-xs">
            시나리오
            <select className="input !w-auto !py-1" value={sc} onChange={(e) => setSc(e.target.value as ScenarioKey)}>
              {(["CONS", "BASE", "OPT"] as ScenarioKey[]).map((k) => (
                <option key={k} value={k}>
                  {SC_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {tab === "pl" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="예상 총수익" value={<Money v={f.revenueTotal} />} />
            <Stat label="예상 총사업비" value={<Money v={f.costTotal} />} sub={<>계획 대비 {fmtNum(ratio(f.costTotal, f.budgetTotal), 1)}%</>} />
            <Stat label="예상 사업손익" value={<Money v={f.profit} />} sub={`수익률 ${fmtNum(f.profitRate, 1)}%`} tone={f.profit < 0 ? "bad" : "good"} />
            <Stat label="누적 할인손실" value={<Money v={f.discountLoss} />} sub="최초 분양가 대비" tone="warn" />
            <Stat label="기집행 / 미지급" value={<Money v={executed} />} sub={<>미지급 <Money v={unpaid} /></>} />
            <Stat label="향후 예정 사업비" value={<Money v={future} />} sub={`${SC_LABEL[sc]} 시나리오 36개월`} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <Card title="수입 항목" className="xl:col-span-2">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th className="r">금액</th>
                    <th className="r">비중</th>
                  </tr>
                </thead>
                <tbody>
                  {f.revenue.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <div className="font-medium">{r.label}</div>
                        <div className="text-[11px] whitespace-normal text-ink3">{r.note}</div>
                      </td>
                      <td className="r num">{m(r.amount)}</td>
                      <td className="r num">{fmtNum(ratio(r.amount, f.revenueTotal), 1)}%</td>
                    </tr>
                  ))}
                  <tr className="bg-[#f3f8fa] font-semibold">
                    <td>예상 총수익</td>
                    <td className="r num">{m(f.revenueTotal)}</td>
                    <td className="r">100%</td>
                  </tr>
                </tbody>
              </table>
            </Card>
            <Card title="지출 항목 (기집행 · 미지급 · 향후 예정)" className="xl:col-span-3">
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>계정</th>
                      <th className="r">계획</th>
                      <th className="r">기집행</th>
                      <th className="r">미지급</th>
                      <th className="r">향후 예정</th>
                      <th className="r">예상 합계</th>
                      <th className="r">계획 대비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.costs.map((r) => (
                      <tr key={r.category}>
                        <td>{r.label}</td>
                        <td className="r num">{m(r.budget)}</td>
                        <td className="r num">{m(r.executed)}</td>
                        <td className="r num">{m(r.unpaid)}</td>
                        <td className="r num">{m(r.future)}</td>
                        <td className="r num font-semibold">{m(r.total)}</td>
                        <td className={clsx("r num", r.variance > 0 ? "text-bad" : "text-good")}>
                          {r.variance > 0 ? "▲" : r.variance < 0 ? "▼" : ""} {m(Math.abs(r.variance))}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[#f3f8fa] font-semibold">
                      <td>합계</td>
                      <td className="r num">{m(f.budgetTotal)}</td>
                      <td className="r num">{m(executed)}</td>
                      <td className="r num">{m(unpaid)}</td>
                      <td className="r num">{m(future)}</td>
                      <td className="r num">{m(f.costTotal)}</td>
                      <td className={clsx("r num", f.costTotal > f.budgetTotal ? "text-bad" : "text-good")}>{m(f.costTotal - f.budgetTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ul className="mt-3 space-y-0.5 text-[11.5px] text-ink3">
                <li>• 기집행 = 사업비 원장 기집행(기초현금월 이전) + 현금흐름 수기 실적 + 채무 상환실적 (금융 차입원금 제외)</li>
                <li>• 미지급 = 채무 원장 잔액(국세·지방세·공사비·운영비·기타) — 금융 차입원금은 비용이 아니므로 제외, 이자·가산금만 반영</li>
                <li>• 향후 예정 = 현금흐름 예측의 비용성 유출(분양대행·광고·운영·이자·법률·하자·예정사업비), 채무 원금상환은 제외(미지급에 이미 계상)</li>
              </ul>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="시나리오별 손익 비교">
              <BarsChart
                kind="money"
                data={(["CONS", "BASE", "OPT"] as ScenarioKey[]).map((k) => ({ name: SC_LABEL[k], revenue: props.feas[k].revenueTotal, cost: props.feas[k].costTotal, profit: props.feas[k].profit }))}
                x="name"
                series={[
                  { key: "revenue", label: "총수익" },
                  { key: "cost", label: "총사업비" },
                  { key: "profit", label: "사업손익" },
                ]}
              />
            </Card>
            <Card title="손익과 현금흐름의 차이 (분리 분석)" sub={`${SC_LABEL[sc]} 시나리오`}>
              <table className="tbl">
                <tbody>
                  <tr className="font-semibold">
                    <td>예상 사업손익 (발생주의)</td>
                    <td className="r num">{m(f.profit)}</td>
                  </tr>
                  {f.cashVsProfit.map((x) => (
                    <tr key={x.label}>
                      <td className="whitespace-normal">{x.label}</td>
                      <td className="r num">{m(x.amount)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td>기간 말 기말현금 (현금주의)</td>
                    <td className="r num">{m(props.cfSummary[sc].endingCash)}</td>
                  </tr>
                </tbody>
              </table>
              <Note>
                손익은 계약 확정 시점에 인식하고, 현금은 계약금·잔금·유예금 회수 시점에 인식합니다. 잔금유예와 회수지연은 손익에 영향이 없거나 작지만 현금흐름을 악화시키므로 두 지표를 함께 관리해야 합니다.
              </Note>
            </Card>
          </div>
        </>
      )}

      {tab === "sim" && <Simulator unsold={props.unsold} fundingRate={props.fundingRate} policies={props.policies} />}

      {tab === "policy" && (
        <Card title="판매조건(정책) 관리" sub="승인된 정책만 영업현장에 적용 — 할인율·잔금유예 조건 변경은 변경이력에 기록됩니다.">
          <EntityManager entity="sales_policies" canWrite={props.canWritePolicy} />
        </Card>
      )}
      {tab === "expense" && (
        <Card title="사업비 원장" sub="계정별 총 사업비 계획 · 기집행(기초현금월 이전 장부) · 향후 예정(채무로 등록되지 않은 지출)">
          <EntityManager entity="expenses" canWrite={props.canWritePolicy} />
        </Card>
      )}
    </div>
  );
}

const SIM_FIELDS: { key: keyof SimInput; label: string; unit: string; step?: number }[] = [
  { key: "units", label: "대상 호실 수", unit: "호", step: 1 },
  { key: "listPrice", label: "최초 분양가격(호실당)", unit: "원", step: 1_000_000 },
  { key: "discountRate", label: "할인율", unit: "%", step: 1 },
  { key: "discountAmount", label: "추가 할인금액(호실당)", unit: "원", step: 1_000_000 },
  { key: "depositRate", label: "계약금 비율", unit: "%", step: 1 },
  { key: "middleRate", label: "중도금 비율", unit: "%", step: 1 },
  { key: "balanceRate", label: "잔금 비율", unit: "%", step: 1 },
  { key: "deferralRate", label: "잔금유예 비율", unit: "%", step: 1 },
  { key: "deferralMonths", label: "유예기간", unit: "개월", step: 1 },
  { key: "deferralInterestRate", label: "유예이자율(매수인 부담)", unit: "%/년", step: 0.5 },
  { key: "agencyFeeRate", label: "분양대행수수료", unit: "%", step: 0.5 },
  { key: "adCost", label: "광고비(총액)", unit: "원", step: 1_000_000 },
  { key: "otherSupport", label: "기타 지원비(호실당)", unit: "원", step: 1_000_000 },
  { key: "contractMonth", label: "예상 계약시점", unit: "개월 후", step: 1 },
  { key: "middleMonth", label: "중도금 시점(계약 후)", unit: "개월", step: 1 },
  { key: "balanceMonth", label: "예상 잔금납부 시점(계약 후)", unit: "개월", step: 1 },
  { key: "costRatio", label: "배분 원가율(최초가 대비)", unit: "%", step: 1 },
  { key: "fundingRate", label: "사업 조달금리", unit: "%/년", step: 0.1 },
  { key: "taxRate", label: "세금·공과(매출 대비, 별도)", unit: "%", step: 0.1 },
];

function Simulator({ unsold, fundingRate, policies }: { unsold: { officetel: { count: number; avgList: number }; retail: { count: number; avgList: number } }; fundingRate: number; policies: SalesPolicy[] }) {
  const { unit } = usePrefs();
  const m = (v: number) => fmtMoney(v, unit, false);
  const [type, setType] = useState<"officetel" | "retail">("officetel");
  const baseFor = (t: "officetel" | "retail"): SimInput => ({
    ...SIM_DEFAULT,
    units: Math.max(1, unsold[t].count),
    listPrice: unsold[t].avgList || SIM_DEFAULT.listPrice,
    fundingRate,
    discountRateNpv: fundingRate,
  });
  const [base, setBase] = useState<SimInput>(baseFor("officetel"));
  const [custom, setCustom] = useState<SimInput>({ ...baseFor("officetel"), discountRate: 15, deferralRate: 20, deferralMonths: 12, contractMonth: 1 });
  const [deferralBasis, setDeferralBasis] = useState<"SUPPLY" | "BALANCE">("SUPPLY");

  const scenarios = useMemo(() => {
    const list = SIM_PRESETS.map((p) => ({ key: p.key, input: { ...base, ...p.patch, deferralBasis: p.patch.deferralRate ? deferralBasis : base.deferralBasis } as SimInput, name: p.name }));
    list.push({ key: "F", input: { ...custom, deferralBasis }, name: "F안: 사용자 직접 입력" });
    return list.map((s) => ({ ...s, errors: validateSim(s.input), result: simulate(s.name, s.input) }));
  }, [base, custom, deferralBasis]);

  const best = scenarios.reduce((a, b) => (b.result.npv > a.result.npv ? b : a));
  const maxMonth = Math.max(...scenarios.map((s) => s.result.paybackMonth));
  const cumData = Array.from({ length: maxMonth + 1 }, (_, mth) => {
    const row: Record<string, unknown> = { month: `${mth}개월` };
    for (const s of scenarios) {
      const last = [...s.result.flows].reverse().find((fl) => fl.month <= mth);
      row[s.key] = last ? last.cum : 0;
    }
    return row;
  });

  const rows: [string, (r: ReturnType<typeof simulate>) => string][] = [
    ["예상 매출액(할인 후 공급금액)", (r) => m(r.revenue)],
    ["총 할인손실", (r) => m(r.discountLoss)],
    ["초기 현금회수액(계약금·중도금·비유예 잔금)", (r) => m(r.initialCash)],
    ["향후 유예금 회수액", (r) => m(r.deferredCash)],
    ["유예이자 수입", (r) => m(r.deferralInterest)],
    ["영업·판촉 비용", (r) => m(r.salesCost)],
    ["금융비용 영향(회수지연 조달비용−유예이자)", (r) => m(r.financeImpact)],
    ["세금·공과(별도 산정)", (r) => m(r.tax)],
    ["배분 원가", (r) => m(r.cost)],
    ["예상 사업손익", (r) => m(r.profit)],
    ["회수기간(최종 회수 시점)", (r) => `${r.paybackMonth}개월`],
    ["순현금흐름(원가 제외)", (r) => m(r.netCash)],
    ["순현금흐름 현재가치(NPV)", (r) => m(r.npv)],
  ];

  return (
    <div className="space-y-4">
      <Card
        title="공통 입력변수"
        sub="A~E안은 공통값에 각 안의 할인·유예·계약시점 조건을 덮어써 계산합니다. F안은 아래에서 직접 입력."
        actions={
          <div className="flex items-center gap-2 text-xs">
            <select
              className="input !w-auto !py-1"
              value={type}
              onChange={(e) => {
                const t = e.target.value as "officetel" | "retail";
                setType(t);
                setBase(baseFor(t));
                setCustom({ ...baseFor(t), discountRate: custom.discountRate, deferralRate: custom.deferralRate, deferralMonths: custom.deferralMonths });
              }}
            >
              <option value="officetel">오피스텔 미분양 ({unsold.officetel.count}호)</option>
              <option value="retail">근린생활시설 미분양 ({unsold.retail.count}호)</option>
            </select>
            <select className="input !w-auto !py-1" value={deferralBasis} onChange={(e) => setDeferralBasis(e.target.value as "SUPPLY" | "BALANCE")}>
              <option value="SUPPLY">유예율 기준: 공급금액 대비</option>
              <option value="BALANCE">유예율 기준: 잔금 대비</option>
            </select>
          </div>
        }
      >
        <SimInputs value={base} onChange={setBase} keys={["units", "listPrice", "depositRate", "middleRate", "balanceRate", "deferralInterestRate", "agencyFeeRate", "adCost", "otherSupport", "middleMonth", "balanceMonth", "costRatio", "fundingRate", "taxRate"]} />
      </Card>
      <Card title="F안: 사용자 직접 입력" sub={policies.length ? "승인·검토 정책을 불러와 수정할 수 있습니다." : undefined}
        actions={
          policies.length ? (
            <select
              className="input !w-auto !py-1 text-xs"
              defaultValue=""
              onChange={(e) => {
                const p = policies.find((x) => x.id === e.target.value);
                if (p)
                  setCustom({
                    ...custom,
                    discountRate: p.discount_rate,
                    depositRate: p.deposit_rate,
                    middleRate: p.middle_rate,
                    balanceRate: p.balance_rate,
                    deferralRate: p.deferral_rate,
                    deferralMonths: p.deferral_months,
                    deferralInterestRate: p.deferral_interest_rate,
                    agencyFeeRate: p.agency_fee_rate,
                    adCost: p.ad_cost * custom.units,
                    otherSupport: p.other_support,
                  });
              }}
            >
              <option value="">판매정책 불러오기</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} {p.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        <SimInputs value={custom} onChange={setCustom} keys={SIM_FIELDS.map((x) => x.key)} />
      </Card>

      <Card title="시나리오별 수익성 비교" sub={`단위: ${{ WON: "원", MAN: "만원", EOK: "억원" }[unit]} · NPV 최대안: ${best.name}`}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>항목</th>
                {scenarios.map((s) => (
                  <th key={s.key} className={clsx("r", s.key === best.key && "!bg-teal-soft")}>
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, fn]) => (
                <tr key={label} className={label.startsWith("예상 사업손익") ? "bg-[#f3f8fa] font-semibold" : ""}>
                  <td>{label}</td>
                  {scenarios.map((s) => (
                    <td key={s.key} className={clsx("r num", label.startsWith("예상 사업손익") && s.result.profit < 0 && "text-bad")}>
                      {fn(s.result)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td>입력 검증</td>
                {scenarios.map((s) => (
                  <td key={s.key} className={clsx("r text-xs whitespace-normal", s.errors.length ? "text-bad" : "text-good")}>
                    {s.errors.length ? s.errors.join(" / ") : "● 정상"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="누적 순현금흐름 비교" sub="기준월(0) 대비 경과월">
          <LinesChart data={cumData} x="month" series={scenarios.slice(0, 5).map((s) => ({ key: s.key, label: s.key + "안" }))} />
          <p className="mt-1 text-[11px] text-ink3">가독성을 위해 A~E안을 표시합니다(F안은 표 참고).</p>
        </Card>
        <Card title="손익 vs 초기 현금회수">
          <BarsChart
            kind="money"
            data={scenarios.map((s) => ({ name: s.key + "안", profit: s.result.profit, initial: s.result.initialCash }))}
            x="name"
            series={[
              { key: "initial", label: "초기 현금회수" },
              { key: "profit", label: "예상 사업손익" },
            ]}
          />
        </Card>
      </div>
      <Note>
        산식: 매출 = 호실수 × (분양가 × (1−할인율) − 추가할인) · 유예금 = 공급금액(또는 잔금) × 유예율 · 금융비용 영향 = Σ(회수금액 × 조달금리/12 × 회수까지 개월) − 유예이자 · 손익 = 매출 + 유예이자 − 영업판촉비 − 세금 − 원가 − 회수지연 조달비용 · 세금(부가세 등)은 과세 구분에 따라 별도 산정 입력값입니다.
      </Note>
    </div>
  );
}

function SimInputs({ value, onChange, keys }: { value: SimInput; onChange: (v: SimInput) => void; keys: (keyof SimInput)[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {SIM_FIELDS.filter((f) => keys.includes(f.key)).map((f) => (
        <label key={f.key} className="block text-xs">
          <span className="mb-1 block text-ink2">
            {f.label} <span className="text-ink3">({f.unit})</span>
          </span>
          <input type="number" step={f.step} className="input num text-right" value={value[f.key] as number} onChange={(e) => onChange({ ...value, [f.key]: Number(e.target.value) })} />
        </label>
      ))}
    </div>
  );
}
