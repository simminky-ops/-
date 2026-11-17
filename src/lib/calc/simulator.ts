// 판매조건별 수익성 시뮬레이터 (A~F안) — 호실 묶음 단위 비교
export interface SimInput {
  units: number; // 대상 호실 수
  listPrice: number; // 호실당 최초 분양가격
  discountRate: number; // 할인율(%)
  discountAmount: number; // 호실당 추가 할인금액(원)
  depositRate: number; // 계약금(%)
  middleRate: number; // 중도금(%)
  balanceRate: number; // 잔금(%)
  deferralRate: number; // 잔금유예율(%)
  deferralBasis: "SUPPLY" | "BALANCE"; // 유예율 산정기준
  deferralMonths: number;
  deferralInterestRate: number; // 매수인 부담 유예이자율(연%)
  agencyFeeRate: number; // 분양대행수수료(%)
  adCost: number; // 광고비(총액)
  otherSupport: number; // 기타 지원비(호실당)
  contractMonth: number; // 예상 계약시점(기준월+n)
  middleMonth: number; // 중도금 납부시점(계약 후 n개월)
  balanceMonth: number; // 예상 잔금납부 시점(계약 후 n개월)
  costRatio: number; // 배분 원가율(최초 분양가 대비 %) — 손익 산정용
  fundingRate: number; // 사업 조달금리(연%) — 금융비용 영향
  taxRate: number; // 매출 대비 세금·공과 별도 산정(%)
  discountRateNpv: number; // NPV 할인율(연%)
}

export interface SimResult {
  name: string;
  revenue: number; // 예상 매출액(할인 후 공급금액 합)
  discountLoss: number; // 총 할인손실
  initialCash: number; // 초기 현금회수액(계약금+중도금+잔금 중 비유예분)
  deferredCash: number; // 향후 유예금 회수액(원금)
  deferralInterest: number; // 유예이자 수입
  salesCost: number; // 영업·판촉비
  financeImpact: number; // 금융비용 영향(회수 지연분 조달비용 − 유예이자)
  tax: number; // 세금(별도 산정)
  cost: number; // 배분 원가
  profit: number; // 예상 사업손익
  paybackMonth: number; // 최종 회수 시점(기준월+n)
  netCash: number; // 순현금흐름(유입−유출, 원가 제외)
  npv: number; // 순현금흐름 현재가치
  flows: { month: number; inflow: number; outflow: number; cum: number }[];
}

export const SIM_DEFAULT: SimInput = {
  units: 10,
  listPrice: 300_000_000,
  discountRate: 0,
  discountAmount: 0,
  depositRate: 10,
  middleRate: 0,
  balanceRate: 90,
  deferralRate: 0,
  deferralBasis: "SUPPLY",
  deferralMonths: 12,
  deferralInterestRate: 3,
  agencyFeeRate: 3,
  adCost: 30_000_000,
  otherSupport: 0,
  contractMonth: 1,
  middleMonth: 1,
  balanceMonth: 2,
  costRatio: 85,
  fundingRate: 7.5,
  taxRate: 0,
  discountRateNpv: 7.5,
};

export const SIM_PRESETS: { key: string; name: string; patch: Partial<SimInput> }[] = [
  { key: "A", name: "A안: 할인 없는 일반분양", patch: { discountRate: 0, deferralRate: 0, contractMonth: 6 } },
  { key: "B", name: "B안: 10% 할인", patch: { discountRate: 10, deferralRate: 0, contractMonth: 3 } },
  { key: "C", name: "C안: 20% 할인", patch: { discountRate: 20, deferralRate: 0, contractMonth: 1 } },
  { key: "D", name: "D안: 20% 할인 + 잔금 30% 유예", patch: { discountRate: 20, deferralRate: 30, deferralBasis: "SUPPLY", deferralMonths: 12, contractMonth: 1 } },
  { key: "E", name: "E안: 30% 할인 + 잔금유예", patch: { discountRate: 30, deferralRate: 20, deferralBasis: "SUPPLY", deferralMonths: 12, contractMonth: 0 } },
];

export function validateSim(i: SimInput): string[] {
  const e: string[] = [];
  const s = i.depositRate + i.middleRate + i.balanceRate;
  if (Math.abs(s - 100) > 0.001) e.push(`계약금+중도금+잔금 비율 합계가 ${s}% 입니다 (100% 필요).`);
  if (i.deferralBasis === "SUPPLY" && i.deferralRate > i.balanceRate) e.push("유예율(공급금액 대비)이 잔금 비율을 초과합니다.");
  if (i.deferralBasis === "BALANCE" && i.deferralRate > 100) e.push("유예율(잔금 대비)은 100%를 넘을 수 없습니다.");
  if (i.discountRate < 0 || i.discountRate >= 100) e.push("할인율은 0~100% 미만이어야 합니다.");
  if (i.units <= 0) e.push("호실 수는 1 이상이어야 합니다.");
  return e;
}

export function simulate(name: string, i: SimInput): SimResult {
  const n = i.units;
  const unitSupply = Math.max(0, i.listPrice * (1 - i.discountRate / 100) - i.discountAmount);
  const revenue = unitSupply * n;
  const discountLoss = (i.listPrice - unitSupply) * n;
  const deposit = revenue * (i.depositRate / 100);
  const middle = revenue * (i.middleRate / 100);
  const balance = revenue * (i.balanceRate / 100);
  const deferred = i.deferralBasis === "SUPPLY" ? revenue * (i.deferralRate / 100) : balance * (i.deferralRate / 100);
  const balanceCash = Math.max(0, balance - deferred);
  const deferralInterest = deferred * (i.deferralInterestRate / 100) * (i.deferralMonths / 12);
  const agency = revenue * (i.agencyFeeRate / 100);
  const support = i.otherSupport * n;
  const salesCost = agency + i.adCost + support;
  const tax = revenue * (i.taxRate / 100);
  const cost = i.listPrice * (i.costRatio / 100) * n;

  const mC = i.contractMonth;
  const mM = mC + i.middleMonth;
  const mB = mC + i.balanceMonth;
  const mD = mB + i.deferralMonths;
  const fl = new Map<number, { inflow: number; outflow: number }>();
  const add = (m: number, inflow: number, outflow: number) => {
    const r = fl.get(m) ?? { inflow: 0, outflow: 0 };
    r.inflow += inflow;
    r.outflow += outflow;
    fl.set(m, r);
  };
  add(0, 0, i.adCost);
  add(mC, deposit, agency + support);
  if (middle) add(mM, middle, 0);
  add(mB, balanceCash, tax);
  if (deferred) add(mD, deferred + deferralInterest, 0);

  // 금융비용 영향: 기준월(0) 대비 회수 시점까지 조달금리로 운용되는 기회비용(=미회수 금액 × 금리 × 기간)
  const monthlyRate = i.fundingRate / 100 / 12;
  const carrying =
    deposit * mC * monthlyRate + middle * mM * monthlyRate + balanceCash * mB * monthlyRate + deferred * mD * monthlyRate;
  const financeImpact = carrying - deferralInterest;

  const months = [...fl.keys()].sort((a, b) => a - b);
  let cum = 0;
  let npv = 0;
  const r = i.discountRateNpv / 100 / 12;
  const flows = months.map((m) => {
    const x = fl.get(m)!;
    cum += x.inflow - x.outflow;
    npv += (x.inflow - x.outflow) / (1 + r) ** m;
    return { month: m, inflow: x.inflow, outflow: x.outflow, cum };
  });
  const profit = revenue + deferralInterest - salesCost - tax - cost - carrying;
  return {
    name,
    revenue,
    discountLoss,
    initialCash: deposit + middle + balanceCash,
    deferredCash: deferred,
    deferralInterest,
    salesCost,
    financeImpact,
    tax,
    cost,
    profit,
    paybackMonth: deferred ? mD : mB,
    netCash: cum,
    npv,
    flows,
  };
}
