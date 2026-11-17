// 예시 데이터 생성기 — 결정적 난수(mulberry32)로 매번 동일한 가상 데이터를 만듭니다.
// ※ 모든 수치·고객·계약 정보는 가상의 '예시 데이터'이며 실제 현장 실적이 아닙니다.
import type { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./password";
import { DEFAULT_SCENARIOS } from "../calc/scenarioDefaults";

const BASE_DATE = "2026-11-17";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function d2s(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(s: string, n: number) {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d2s(d);
}
function addMonthsD(s: string, n: number) {
  const d = new Date(s + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d2s(d);
}
function daysDiff(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
const r6 = (v: number) => Math.round(v / 1e6) * 1e6; // 백만원 단위 반올림
const r4 = (v: number) => Math.round(v / 1e4) * 1e4; // 만원 단위

export const DEMO_USERS = [
  { username: "exec", name: "경영진 A", role: "EXECUTIVE", pii: 0 },
  { username: "pm", name: "사업관리 PM A", role: "PM", pii: 1 },
  { username: "sales1", name: "영업담당 A", role: "SALES", pii: 1 },
  { username: "sales2", name: "영업담당 B", role: "SALES", pii: 1 },
  { username: "leasing", name: "임대담당 A", role: "LEASING", pii: 0 },
  { username: "finance", name: "재무담당 A", role: "FINANCE", pii: 1 },
  { username: "admin", name: "시스템관리자", role: "ADMIN", pii: 0 },
  { username: "external", name: "외부보고 열람자", role: "EXTERNAL", pii: 0 },
] as const;

/** 데모 계정 공통 초기 비밀번호 — 환경변수 AD_DEMO_PASSWORD 로 변경 가능(README 참고) */
export const DEMO_PASSWORD = process.env.AD_DEMO_PASSWORD || "AdProject2026";

export function ensureSeeded(db: DatabaseSync) {
  const r = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (r.n > 0) return;
  seedAll(db);
}

export function seedAll(db: DatabaseSync) {
  const rnd = mulberry32(20261117);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const dateBetween = (a: string, b: string) => addDays(a, Math.floor(rnd() * (daysDiff(a, b) + 1)));

  const ins = (table: string, row: Record<string, unknown>) => {
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(
      ...(keys.map((k) => (row[k] === undefined ? null : row[k])) as never[]),
    );
  };
  const counters: Record<string, number> = {};
  const nid = (prefix: string, pad: number) => {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `${prefix}${String(counters[prefix]).padStart(pad, "0")}`;
  };

  db.exec("BEGIN");
  try {
    // ---------- 역할 / 사용자 ----------
    const roles: [string, string, string][] = [
      ["EXTERNAL", "외부 보고자", "승인된 익명 사업계획서와 집계자료 조회"],
      ["EXECUTIVE", "경영진", "사업 전체 KPI, 재무현황, 보고서 및 승인업무"],
      ["PM", "사업관리 PM", "사업관리 전반 조회·등록·수정"],
      ["SALES", "분양 담당자", "영업 CRM과 배정 계약 관련 업무"],
      ["LEASING", "임대 담당자", "임대 및 MD 관련 업무"],
      ["FINANCE", "재무 담당자", "수납·지급·채무·현금흐름 관련 업무"],
      ["ADMIN", "시스템 관리자", "계정관리, 권한설정, 운영로그 및 시스템 설정"],
    ];
    for (const [code, name, description] of roles) ins("roles", { code, name, description });
    for (const u of DEMO_USERS)
      ins("users", { username: u.username, name: u.name, role_code: u.role, password_hash: hashPassword(DEMO_PASSWORD), pii_access: u.pii });

    // ---------- 설정 ----------
    const settings: Record<string, unknown> = {
      project_name: "수도권 A복합개발사업",
      base_date: BASE_DATE,
      completion_date: "2026-03-20",
      opening_cash: 3_500_000_000,
      opening_cash_month: "2026-04",
      cashflow_start: "2026-11",
      cashflow_months: 36,
      min_cash: 500_000_000,
      project_funding_rate: 7.5,
      external_show_amounts: false,
      data_version: 1,
      targets: {
        sale_rate: 90,
        amount_sale_rate: 85,
        officetel_rate: 92,
        retail_rate: 70,
        unsold_rate: 10,
        collection_rate: 90,
        receivable: 3_000_000_000,
        lease_rate: 75,
        collected: 95_000_000_000,
        debt_balance: 15_000_000_000,
        repay_rate: 40,
        ending_cash: 500_000_000,
      },
      scenarios: DEFAULT_SCENARIOS,
    };
    for (const [k, v] of Object.entries(settings)) ins("settings", { key: k, value: JSON.stringify(v) });

    // ---------- 호실(자산) ----------
    type A = { id: string; type: "OFFICETEL" | "RETAIL"; floor: number; ex: number; list: number };
    const assets: A[] = [];
    const otAreas = [21.48, 24.86, 24.86, 29.62, 21.48, 24.86, 38.24, 29.62];
    let n = 0;
    for (let floor = 4; floor <= 18; floor++) {
      for (let pos = 1; pos <= 16; pos++) {
        n++;
        const ex = otAreas[(pos - 1) % otAreas.length];
        const perSqm = 11_500_000 * (1 + (floor - 4) * 0.006) * (pos === 1 || pos === 16 ? 1.03 : 1);
        assets.push({ id: `A-${String(n).padStart(3, "0")}`, type: "OFFICETEL", floor, ex, list: r6(ex * perSqm) });
      }
    }
    const retailPlan: [number, number, number, number][] = [
      [1, 14, 30_000_000, 55],
      [2, 12, 15_000_000, 72],
      [3, 10, 10_000_000, 88],
    ];
    n = 0;
    for (const [floor, cnt, perSqm, avgArea] of retailPlan) {
      for (let i = 0; i < cnt; i++) {
        n++;
        const ex = Math.round(avgArea * between(0.65, 1.45) * 100) / 100;
        assets.push({ id: `B-${String(n).padStart(3, "0")}`, type: "RETAIL", floor, ex, list: r6(ex * perSqm * between(0.95, 1.06)) });
      }
    }
    const mdByFloor: Record<number, string[]> = {
      1: ["생활밀착형 음식점", "간편식·베이커리", "편의점", "프랜차이즈 F&B", "약국", "생활편의(세탁·수선)"],
      2: ["카페", "외식업", "디저트", "음식점", "체류형 서비스"],
      3: ["의원", "교육(학원)", "전문서비스", "생활서비스(미용)", "피트니스"],
    };

    // 자산 INSERT (계약 FK 보다 먼저)
    const salesMgrs = ["영업담당 A", "영업담당 B", "영업담당 C", "영업담당 D"];
    for (const a of assets) {
      const floorMd = a.type === "RETAIL" ? mdByFloor[a.floor][Math.floor(rnd() * mdByFloor[a.floor].length)] : null;
      ins("assets", {
        id: a.id,
        facility_type: a.type,
        building: a.type === "OFFICETEL" ? "업무·주거동" : "상업동",
        floor: a.floor,
        exclusive_area: a.ex,
        contract_area: Math.round(a.ex * (a.type === "OFFICETEL" ? 1.96 : 1.72) * 100) / 100,
        usage: a.type === "OFFICETEL" ? "업무시설(오피스텔)" : a.floor === 3 ? "제2종 근린생활시설" : "제1종 근린생활시설",
        list_price: a.list,
        current_price: a.list,
        is_sale_target: 1,
        leasable: a.type === "RETAIL" ? 1 : 0,
        recommended_industry: floorMd,
        manager: a.type === "RETAIL" ? "임대담당 A" : pick(salesMgrs),
        note: "예시 데이터",
      });
    }

    // ---------- 계약 생성 ----------
    const surnames = "김이박최정강조윤장임한오서신권황안송류홍";
    const given = ["민준", "서연", "도윤", "하은", "시우", "지민", "예준", "수아", "주원", "지우", "현우", "서윤", "건우", "채원", "우진", "유나"];
    const fakeName = () => `${pick(surnames.split(""))}${pick(given)}`;
    const fakePhone = () => `010-0${Math.floor(between(100, 999))}-${String(Math.floor(between(0, 9999))).padStart(4, "0")}`;

    const soldAssets = new Set<string>();
    const contractsMade: { id: string; asset: A; date: string; supply: number; resale: boolean; mgr: string; post: boolean }[] = [];

    const newParty = () => {
      const pid = nid("P-", 4);
      ins("contract_parties", {
        id: pid,
        party_type: rnd() < 0.9 ? "INDIVIDUAL" : "CORPORATE",
        name: fakeName(),
        phone: fakePhone(),
        email: null,
        address: "수도권 (예시)",
        note: "예시 데이터",
      });
      return pid;
    };

    const payment = (cid: string, aid: string, type: string, amount: number, date: string, deferralId: string | null = null, note: string | null = null) => {
      if (date > BASE_DATE || amount === 0) return;
      ins("payments", { id: nid("PM-", 5), contract_id: cid, asset_id: aid, pay_type: type, amount, paid_date: date, deferral_id: deferralId, method: "가상계좌", note });
    };

    const lateFee = (principal: number, due: string, paid: string, rate: number) =>
      r4((principal * (rate / 100) * Math.max(0, daysDiff(due, paid))) / 365);

    const BAL_DUE = "2026-05-31";

    const makeReceivable = (cid: string, aid: string, billed: number, due: string, extra: Record<string, unknown>) => {
      const rid = nid("R-", 4);
      ins("receivables", {
        id: rid,
        contract_id: cid,
        asset_id: aid,
        rec_type: "BALANCE",
        billed_amount: billed,
        due_date: due,
        notice_count: 0,
        negotiation_status: "NONE",
        expected_amount: 0,
        legal_action: 0,
        status: "OPEN",
        manager: "재무담당 A",
        ...extra,
      });
      return rid;
    };

    // (1) 사전 분양 계약 (준공 전)
    for (const a of assets) {
      const p = a.type === "OFFICETEL" ? 0.835 : 0.5;
      if (rnd() >= p) continue;
      const cid = nid("C-", 4);
      const date = dateBetween(a.type === "OFFICETEL" ? "2023-03-10" : "2023-05-01", "2025-11-30");
      const supply = a.list;
      const dep = r4(supply * 0.1);
      const mid = r4(supply * 0.6);
      const bal = supply - dep - mid;
      const mgr = pick(salesMgrs);
      const maturity = rnd() < 0.7 ? "2026-12-31" : "2027-03-31";
      const yrs = Math.max(0.3, daysDiff(date, "2026-03-20") / 365);
      const outcome = rnd();
      let status = "ACTIVE";
      let terminatedAt: string | null = null;
      let reason: string | null = null;
      if (outcome >= 0.9) {
        status = "TERMINATED";
        terminatedAt = dateBetween("2026-06-15", "2026-10-31");
        reason = rnd() < 0.6 ? "잔금 미납에 따른 해지" : "합의해지";
      } else if (outcome < 0.64) status = "COMPLETED";

      ins("sale_contracts", {
        id: cid,
        asset_id: a.id,
        contract_date: date,
        list_price_at_contract: a.list,
        discount_amount: 0,
        supply_price: supply,
        deposit_amount: dep,
        middle_amount: mid,
        balance_amount: bal,
        balance_due_date: BAL_DUE,
        late_fee_rate: 12,
        middle_loan_maturity: maturity,
        middle_loan_interest: r4(mid * 0.045 * yrs * 0.5),
        status,
        is_resale: 0,
        terminated_at: terminatedAt,
        termination_reason: reason,
        sales_manager: mgr,
        party_id: newParty(),
        note: "예시 데이터",
      });
      // 계약금·중도금(6회차)
      payment(cid, a.id, "DEPOSIT", dep, date);
      const midStart = addMonthsD(date, 2);
      const span = Math.max(30, daysDiff(midStart, "2026-02-28"));
      let midPaid = 0;
      for (let k = 0; k < 6; k++) {
        const amt = k === 5 ? mid - midPaid : r4(mid / 6);
        midPaid += amt;
        payment(cid, a.id, "MIDDLE", amt, addDays(midStart, Math.floor((span * k) / 5)));
      }

      if (status === "COMPLETED") {
        const paidDate = rnd() < 0.8 ? dateBetween("2026-04-10", BAL_DUE) : dateBetween("2026-06-01", "2026-09-30");
        payment(cid, a.id, "BALANCE", bal, paidDate);
        if (paidDate > BAL_DUE) payment(cid, a.id, "LATE_FEE", lateFee(bal, BAL_DUE, paidDate, 12), addDays(paidDate, 3), null, "연체료 정산");
        makeReceivable(cid, a.id, bal, BAL_DUE, { status: "CLOSED", negotiation_status: "CLOSED", note: "완납" });
        soldAssets.add(a.id);
      } else if (status === "ACTIVE" && outcome < 0.76) {
        // 잔금 일부 유예 (잔금 대비 50%)
        const deferred = r4(bal * 0.5);
        const months = rnd() < 0.3 ? 6 : 12;
        const did = nid("DF-", 4);
        const matur = addMonthsD(BAL_DUE, months);
        ins("deferrals", {
          id: did,
          contract_id: cid,
          asset_id: a.id,
          basis: "BALANCE",
          deferral_rate: 50,
          deferred_amount: deferred,
          interest_rate: 4.5,
          start_date: BAL_DUE,
          maturity_date: matur,
          status: "ACTIVE",
          note: "예시 데이터",
        });
        payment(cid, a.id, "BALANCE", bal - deferred, dateBetween("2026-05-10", BAL_DUE));
        makeReceivable(cid, a.id, bal, BAL_DUE, { status: "OPEN", negotiation_status: "PROMISED", expected_amount: deferred, expected_date: matur, note: "잔금유예 약정" });
        soldAssets.add(a.id);
      } else if (status === "ACTIVE") {
        // 잔금 연체
        let paid = 0;
        if (rnd() < 0.35) {
          paid = r4(bal * between(0.2, 0.6));
          payment(cid, a.id, "BALANCE", paid, dateBetween("2026-06-15", "2026-10-15"));
        }
        const notices = Math.floor(between(0, 4));
        const neg = pick(["CONTACTING", "NEGOTIATING", "PROMISED", "PROMISED", "LEGAL", "TERMINATING"]);
        const promised = neg === "PROMISED";
        const expDate = promised ? dateBetween("2026-12-01", "2027-04-30") : null;
        const rid = makeReceivable(cid, a.id, bal, BAL_DUE, {
          notice_count: notices,
          last_notice_date: notices > 0 ? dateBetween("2026-07-01", "2026-11-10") : null,
          negotiation_status: neg,
          promise_date: promised ? expDate : null,
          expected_amount: promised ? bal - paid : 0,
          expected_date: expDate,
          legal_action: neg === "LEGAL" ? 1 : 0,
          note: "예시 데이터",
        });
        for (let k = 1; k <= notices; k++) {
          ins("collection_actions", {
            id: nid("CA-", 5),
            receivable_id: rid,
            action_date: addDays("2026-06-20", k * 35 + Math.floor(rnd() * 10)),
            action_type: "NOTICE",
            round: k,
            note: `${k}차 최고장 발송 (예시)`,
          });
        }
        if (neg === "PROMISED")
          ins("collection_actions", { id: nid("CA-", 5), receivable_id: rid, action_date: dateBetween("2026-09-01", "2026-11-10"), action_type: "PROMISE", round: null, note: "납부약정서 수령 (예시)" });
        soldAssets.add(a.id);
      } else {
        // 해지: 위약금(계약금) 공제 후 환급
        const paidSoFar = dep + mid;
        const refundDate = addDays(terminatedAt!, 10);
        payment(cid, a.id, "REFUND", -(paidSoFar - dep), refundDate, null, "해지 정산 환급(중도금대출 상환 포함)");
        // 재판매(약 55%)
        if (rnd() < 0.55) {
          const rdate = addDays(terminatedAt!, Math.floor(between(15, 75)));
          if (rdate <= "2026-11-14") {
            makeResale(a, rdate, cid);
          }
        }
      }
      contractsMade.push({ id: cid, asset: a, date, supply, resale: false, mgr, post: false });
    }

    function makeResale(a: A, date: string, prevId: string) {
      const cur = r6(a.list * 0.95);
      const discRate = pick([0.1, 0.12, 0.15, 0.18]);
      const disc = r4(cur * discRate);
      const supply = cur - disc;
      const dep = r4(supply * 0.1);
      const bal = supply - dep;
      const due = addDays(date, 60);
      const mgr = pick(salesMgrs);
      const cid = nid("C-", 4);
      const onTime = rnd() < 0.75;
      const completed = due <= BASE_DATE && onTime;
      ins("sale_contracts", {
        id: cid,
        asset_id: a.id,
        contract_date: date,
        list_price_at_contract: cur,
        discount_amount: disc,
        supply_price: supply,
        deposit_amount: dep,
        middle_amount: 0,
        balance_amount: bal,
        balance_due_date: due,
        late_fee_rate: 12,
        middle_loan_maturity: null,
        middle_loan_interest: 0,
        status: completed ? "COMPLETED" : "ACTIVE",
        is_resale: 1,
        prev_contract_id: prevId,
        sales_manager: mgr,
        party_id: newParty(),
        note: `재판매 (할인 ${Math.round(discRate * 100)}%) — 예시 데이터`,
      });
      payment(cid, a.id, "DEPOSIT", dep, date);
      if (due <= BASE_DATE) {
        if (completed) {
          payment(cid, a.id, "BALANCE", bal, dateBetween(addDays(due, -20), due));
          makeReceivable(cid, a.id, bal, due, { status: "CLOSED", negotiation_status: "CLOSED", note: "완납" });
        } else {
          makeReceivable(cid, a.id, bal, due, { negotiation_status: "CONTACTING", notice_count: 1, last_notice_date: addDays(due, 20), note: "재판매 잔금 지연 (예시)" });
        }
      }
      soldAssets.add(a.id);
      contractsMade.push({ id: cid, asset: a, date, supply, resale: true, mgr, post: true });
      return cid;
    }

    // (2) 준공 후 미분양 신규판매
    const unsold = assets.filter((a) => !soldAssets.has(a.id));
    const otUnsold = unsold.filter((a) => a.type === "OFFICETEL");
    const rtUnsold = unsold.filter((a) => a.type === "RETAIL");
    const newSales = [...otUnsold.slice(0, 18), ...rtUnsold.slice(0, 3)];
    newSales.forEach((a, i) => {
      const date = dateBetween(addDays("2026-04-10", i * 9), addDays("2026-04-20", i * 10));
      if (date > "2026-11-14") return;
      const cur = r6(a.list * 0.95);
      const policy = rnd();
      const discRate = policy < 0.5 ? 0.1 : 0.2;
      const withDeferral = policy >= 0.8;
      const disc = r4(cur * discRate);
      const supply = cur - disc;
      const dep = r4(supply * 0.1);
      const bal = supply - dep;
      const due = addDays(date, 60);
      const cid = nid("C-", 4);
      const mgr = pick(salesMgrs);
      const deferred = withDeferral ? r4(supply * 0.3) : 0;
      const willComplete = due <= BASE_DATE && !withDeferral && rnd() < 0.85;
      ins("sale_contracts", {
        id: cid,
        asset_id: a.id,
        contract_date: date,
        list_price_at_contract: cur,
        discount_amount: disc,
        supply_price: supply,
        deposit_amount: dep,
        middle_amount: 0,
        balance_amount: bal,
        balance_due_date: due,
        late_fee_rate: 12,
        status: willComplete ? "COMPLETED" : "ACTIVE",
        is_resale: 0,
        sales_manager: mgr,
        party_id: newParty(),
        note: `준공 후 미분양 판매 (할인 ${Math.round(discRate * 100)}%${withDeferral ? " + 잔금 30% 유예" : ""}) — 예시 데이터`,
      });
      payment(cid, a.id, "DEPOSIT", dep, date);
      if (withDeferral) {
        const did = nid("DF-", 4);
        const matur = addMonthsD(due, 12);
        ins("deferrals", { id: did, contract_id: cid, asset_id: a.id, basis: "SUPPLY", deferral_rate: 30, deferred_amount: deferred, interest_rate: 3, start_date: due, maturity_date: matur, status: "ACTIVE", note: "예시 데이터" });
        if (due <= BASE_DATE) {
          payment(cid, a.id, "BALANCE", bal - deferred, dateBetween(addDays(due, -15), due));
          makeReceivable(cid, a.id, bal, due, { negotiation_status: "PROMISED", expected_amount: deferred, expected_date: matur, note: "잔금유예 약정" });
        }
      } else if (due <= BASE_DATE) {
        if (willComplete) {
          payment(cid, a.id, "BALANCE", bal, dateBetween(addDays(due, -20), due));
          makeReceivable(cid, a.id, bal, due, { status: "CLOSED", negotiation_status: "CLOSED", note: "완납" });
        } else makeReceivable(cid, a.id, bal, due, { negotiation_status: "CONTACTING", note: "잔금 지연 (예시)" });
      }
      soldAssets.add(a.id);
      contractsMade.push({ id: cid, asset: a, date, supply, resale: false, mgr, post: true });
    });

    // 6개월 유예 일부는 조기 상환 처리 (2건)
    const sixMonth = db
      .prepare("SELECT id, contract_id, asset_id, deferred_amount FROM deferrals WHERE maturity_date = '2026-11-30' LIMIT 2")
      .all() as { id: string; contract_id: string; asset_id: string; deferred_amount: number }[];
    for (const d of sixMonth) {
      payment(d.contract_id, d.asset_id, "DEFERRAL", d.deferred_amount, "2026-10-28", d.id, "유예금 조기상환");
      db.prepare("UPDATE deferrals SET status='REPAID' WHERE id=?").run(d.id);
      db.prepare("UPDATE sale_contracts SET status='COMPLETED' WHERE id=?").run(d.contract_id);
      db.prepare("UPDATE receivables SET status='CLOSED', negotiation_status='CLOSED' WHERE contract_id=?").run(d.contract_id);
    }

    // 현재 분양가: 미분양 호실은 최초가 대비 5% 인하 / 재판매 호실은 재판매 기준가
    for (const a of assets) {
      if (!soldAssets.has(a.id)) db.prepare("UPDATE assets SET current_price=? WHERE id=?").run(r6(a.list * 0.95), a.id);
    }
    db.prepare(
      "UPDATE assets SET current_price = (SELECT list_price_at_contract FROM sale_contracts c WHERE c.asset_id = assets.id AND c.is_resale = 1 AND c.status <> 'TERMINATED') WHERE EXISTS (SELECT 1 FROM sale_contracts c WHERE c.asset_id = assets.id AND c.is_resale = 1 AND c.status <> 'TERMINATED')",
    ).run();

    // ---------- 임대 / MD ----------
    const retail = assets.filter((a) => a.type === "RETAIL");
    const rentPerSqm: Record<number, number> = { 1: 52_000, 2: 27_000, 3: 19_000 };
    const leaseProb: Record<number, number> = { 1: 0.8, 2: 0.55, 3: 0.35 };
    const tenants: Record<number, string[]> = {
      1: ["한식당", "김밥·분식", "편의점", "베이커리", "약국", "세탁편의점", "버거 프랜차이즈", "샐러드"],
      2: ["대형 카페(앵커)", "디저트 카페", "이자카야", "브런치", "파스타", "스터디카페"],
      3: ["내과의원(앵커)", "치과의원", "영어학원", "필라테스", "세무회계사무소", "미용실"],
    };
    let anchor2 = false;
    let anchor3 = false;
    for (const a of retail) {
      const owned = !soldAssets.has(a.id);
      const r = rnd();
      if (r < leaseProb[a.floor]) {
        const start = dateBetween("2026-04-01", "2026-11-01");
        const ind = pick(tenants[a.floor]);
        const isAnchor = (a.floor === 2 && !anchor2 && ind.includes("앵커")) || (a.floor === 3 && !anchor3 && ind.includes("앵커"));
        if (a.floor === 2 && isAnchor) anchor2 = true;
        if (a.floor === 3 && isAnchor) anchor3 = true;
        const rent = r4(a.ex * rentPerSqm[a.floor] * between(0.9, 1.1));
        const opened = rnd() < 0.8;
        const moveIn = addDays(start, 30);
        ins("leases", {
          id: nid("L-", 4),
          asset_id: a.id,
          tenant_name: `${ind.replace("(앵커)", "")} 임차인 (예시)`,
          desired_industry: ind.replace("(앵커)", ""),
          actual_industry: ind.replace("(앵커)", ""),
          deposit: rent * 10,
          monthly_rent: rent,
          mgmt_fee: r4(a.ex * 1.72 * 6_500),
          rent_free_months: isAnchor ? 6 : Math.floor(between(1, 4)),
          start_date: start,
          end_date: addMonthsD(start, 60),
          move_in_date: moveIn,
          open_date: opened && addDays(moveIn, 30) <= BASE_DATE ? addDays(moveIn, 30) : null,
          leasing_fee: r4(rent * 1.5),
          tenant_support: isAnchor ? 30_000_000 : 0,
          negotiation_status: opened && addDays(moveIn, 30) <= BASE_DATE ? "OPEN" : "CONTRACTED",
          income_recipient: owned ? "DEVELOPER" : "OWNER",
          is_anchor: isAnchor ? 1 : 0,
          manager: "임대담당 A",
          note: "예시 데이터",
        });
      } else if (r < leaseProb[a.floor] + 0.25) {
        const ind = pick(tenants[a.floor]).replace("(앵커)", "");
        ins("leases", {
          id: nid("L-", 4),
          asset_id: a.id,
          tenant_name: `${ind} 후보 (예시)`,
          desired_industry: ind,
          actual_industry: null,
          deposit: 0,
          monthly_rent: r4(a.ex * rentPerSqm[a.floor] * 0.95),
          negotiation_status: pick(["LEAD", "NEGOTIATING", "LOI"]),
          income_recipient: owned ? "DEVELOPER" : "OWNER",
          manager: "임대담당 A",
          note: "협상 중 (예시 데이터)",
        });
      }
    }

    // ---------- CRM ----------
    const channels = ["WALKIN", "PHONE", "ONLINE", "AGENCY", "REFERRAL", "EVENT"];
    const chW = [0.22, 0.2, 0.25, 0.18, 0.1, 0.05];
    const pickCh = () => {
      let x = rnd();
      for (let i = 0; i < channels.length; i++) {
        x -= chW[i];
        if (x <= 0) return channels[i];
      }
      return channels[0];
    };
    const post = contractsMade.filter((c) => c.post);
    for (const c of post) {
      const cd = addDays(c.date, -Math.floor(between(5, 40)));
      ins("crm_leads", {
        id: nid("CL-", 4),
        consult_date: cd < "2026-04-01" ? "2026-04-01" : cd,
        channel: pickCh(),
        manager: c.mgr,
        interest_type: c.asset.type,
        interest_asset_id: c.asset.id,
        initial_price: r6(c.asset.list * 0.95),
        discount_offer_rate: Math.round((1 - c.supply / (c.asset.list * 0.95)) * 1000) / 10,
        deferral_terms: null,
        customer_wish: "할인 및 잔금 일정 조정",
        expected_contract_date: c.date,
        stage: "CONTRACTED",
        visited: 1,
        valid: 1,
        contracted: 1,
        contract_amount: c.supply,
        contract_id: c.id,
        is_resale: c.resale ? 1 : 0,
        customer_name: fakeName(),
        customer_phone: fakePhone(),
        note: "예시 데이터",
      });
    }
    const openStages = ["INFLOW", "CONSULT", "CONSULT", "VISIT", "VISIT", "OFFER", "NEGOTIATE", "DROPPED", "DROPPED", "DROPPED"];
    const unsoldNow = assets.filter((a) => !soldAssets.has(a.id));
    for (let i = 0; i < 125; i++) {
      const stage = pick(openStages);
      const a = rnd() < 0.7 ? pick(unsoldNow) : null;
      const type = a ? a.type : rnd() < 0.8 ? "OFFICETEL" : "RETAIL";
      const cd = dateBetween("2026-04-01", "2026-11-16");
      ins("crm_leads", {
        id: nid("CL-", 4),
        consult_date: cd,
        channel: pickCh(),
        manager: pick(salesMgrs),
        interest_type: type,
        interest_asset_id: a?.id ?? null,
        initial_price: a ? r6(a.list * 0.95) : 0,
        discount_offer_rate: ["OFFER", "NEGOTIATE"].includes(stage) ? pick([10, 15, 20]) : 0,
        deferral_terms: stage === "NEGOTIATE" && rnd() < 0.5 ? "잔금 30% 12개월 유예 요청" : null,
        customer_wish: pick(["추가 할인", "임대 보장", "잔금 유예", "중도금 대출 승계", "빠른 입주", null]),
        expected_contract_date: ["OFFER", "NEGOTIATE"].includes(stage) ? dateBetween("2026-11-20", "2027-01-31") : null,
        stage,
        visited: ["VISIT", "OFFER", "NEGOTIATE"].includes(stage) || (stage === "DROPPED" && rnd() < 0.4) ? 1 : 0,
        valid: stage === "INFLOW" && rnd() < 0.4 ? 0 : 1,
        next_date: stage === "DROPPED" ? null : dateBetween("2026-11-18", "2026-12-20"),
        contracted: 0,
        contract_amount: 0,
        is_resale: 0,
        customer_name: fakeName(),
        customer_phone: fakePhone(),
        note: "예시 데이터",
      });
    }

    // ---------- 판매조건(정책) ----------
    const policies = [
      ["일반분양(A안)", 0, 0, 0, 0],
      ["10% 할인(B안)", 10, 0, 0, 0],
      ["20% 할인(C안)", 20, 0, 0, 0],
      ["20% 할인 + 잔금 30% 유예(D안)", 20, 30, 12, 3],
      ["30% 할인 + 잔금유예(E안)", 30, 20, 12, 3],
    ] as const;
    for (const [name, disc, defr, months, rate] of policies)
      ins("sales_policies", {
        id: nid("SP-", 3),
        name,
        discount_rate: disc,
        deposit_rate: 10,
        middle_rate: 0,
        balance_rate: 90,
        deferral_rate: defr,
        deferral_basis: "SUPPLY",
        deferral_months: months,
        deferral_interest_rate: rate,
        agency_fee_rate: 3,
        ad_cost: 3_000_000,
        other_support: disc >= 20 ? 5_000_000 : 0,
        status: disc <= 20 ? "APPROVED" : "DRAFT",
        effective_from: "2026-04-01",
        note: "예시 데이터",
      });

    // ---------- 사업비 ----------
    const ex = (category: string, item: string, budget: number, executed: number, planned = 0, month: string | null = null) =>
      ins("expenses", { id: nid("EX-", 3), category, item, budget_amount: budget, executed_amount: executed, planned_amount: planned, planned_month: month, note: "예시 데이터" });
    ex("LAND", "토지매입비 및 부대비용", 21_000_000_000, 21_000_000_000);
    ex("CONSTRUCTION", "도급공사비", 56_000_000_000, 49_000_000_000);
    ex("DESIGN", "설계·감리·인허가", 4_500_000_000, 4_300_000_000, 200_000_000, "2026-12");
    ex("AGENCY_FEE", "분양대행수수료(준공 전)", 3_800_000_000, 2_700_000_000);
    ex("AD", "광고홍보비(준공 전)", 1_400_000_000, 1_250_000_000);
    ex("FINANCE", "PF 이자·수수료", 10_500_000_000, 6_800_000_000);
    ex("TAX", "국세·지방세(기납부)", 4_200_000_000, 1_000_000_000);
    ex("OPERATION", "시행법인 운영비(준공 후 36개월 포함)", 4_500_000_000, 700_000_000);
    ex("BUILDING_MGMT", "미분양 호실 관리비", 400_000_000, 120_000_000, 150_000_000, "2027-03");
    ex("DEFECT", "하자보수 충당(사업주체 부담분)", 300_000_000, 40_000_000, 120_000_000, "2027-02");
    ex("LEGAL", "법률자문·소송비용", 250_000_000, 60_000_000);
    ex("OTHER", "보존등기·정산 기타비용", 1_500_000_000, 900_000_000, 300_000_000, "2027-06");

    // ---------- 채무 및 상환 ----------
    const debt = (type: string, creditor: string, desc: string, principal: number, penalty: number, rate: number, due: string, inst: string, priority: number) => {
      const id = nid("D-", 3);
      ins("debts", { id, debt_type: type, creditor, description: desc, principal, interest_penalty: penalty, interest_rate: rate, due_date: due, installment_status: inst, priority, negotiator: "재무담당 A", note: "예시 데이터" });
      return id;
    };
    const rep = (debtId: string, kind: "PLAN" | "ACTUAL", month: string, amount: number) =>
      ins("debt_repayments", { id: nid("DR-", 5), debt_id: debtId, kind, month, pay_date: kind === "ACTUAL" ? `${month}-25` : null, amount, note: "예시 데이터" });

    const dTax = debt("NATIONAL_TAX", "과세관청(국세)", "부가가치세 등 분납", 1_800_000_000, 120_000_000, 0, "2026-12-31", "AGREED", 1);
    ["2026-08", "2026-09", "2026-10"].forEach((m) => rep(dTax, "ACTUAL", m, 150_000_000));
    for (const m of ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07"]) rep(dTax, "PLAN", m, 150_000_000);
    const dLocal = debt("LOCAL_TAX", "과세관청(지방세)", "취득세 등", 1_200_000_000, 60_000_000, 0, "2026-12-15", "NEGOTIATING", 2);
    rep(dLocal, "PLAN", "2026-12", 400_000_000);
    rep(dLocal, "PLAN", "2027-03", 400_000_000);
    rep(dLocal, "PLAN", "2027-06", 400_000_000);
    // PF: 준공 시점 잔액 300억 → 잔금 수납분으로 신탁 우선상환, 잔여분 만기연장(2029-03) 합의 가정
    const pfRepay: [string, number][] = [["2026-05", 7_000_000_000], ["2026-06", 5_500_000_000], ["2026-07", 3_000_000_000], ["2026-08", 2_000_000_000], ["2026-09", 1_500_000_000], ["2026-10", 1_000_000_000]];
    const dPf = debt("FINANCE", "금융기관 A", "PF 대출 잔여원금(만기연장)", 30_000_000_000, 0, 7.2, "2029-03-31", "AGREED", 3);
    for (const [m, amt] of pfRepay) rep(dPf, "ACTUAL", m, amt);
    for (const [m, amt] of [["2027-03", 1_000_000_000], ["2027-09", 2_000_000_000], ["2028-03", 2_000_000_000], ["2028-09", 2_500_000_000], ["2029-03", 2_500_000_000]] as const) rep(dPf, "PLAN", m, amt);
    const dCon = debt("CONSTRUCTION", "시공사 A", "미지급 공사비(준공정산)", 7_000_000_000, 0, 0, "2027-11-30", "AGREED", 4);
    rep(dCon, "ACTUAL", "2026-07", 500_000_000);
    rep(dCon, "ACTUAL", "2026-09", 500_000_000);
    for (let i = 0; i < 12; i++) {
      const m = i < 1 ? "2026-12" : `2027-${String(i).padStart(2, "0")}`;
      rep(dCon, "PLAN", m, 500_000_000);
    }
    const dOpex = debt("OPEX", "운영 협력사", "운영비 미지급금", 320_000_000, 0, 0, "2026-12-31", "NONE", 5);
    rep(dOpex, "PLAN", "2026-12", 160_000_000);
    rep(dOpex, "PLAN", "2027-01", 160_000_000);
    debt("OTHER", "분양대행사 A", "준공 전 분양대행수수료 미지급분", 1_100_000_000, 0, 0, "2027-03-31", "NEGOTIATING", 6);

    // ---------- 현금흐름 실적(수기 계정) 2026-04 ~ 2026-10 ----------
    const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
    let pfBal = 30_000_000_000;
    for (const m of months) {
      const cfa = (account: string, amount: number, note: string) => ins("cashflow_actuals", { id: nid("CFA-", 5), month: m, account, amount, note });
      cfa("OPEX", r6(between(80_000_000, 100_000_000)), "인건비·운영비 (예시)");
      cfa("SALES_COST", r6(between(40_000_000, 90_000_000)), "광고·분양대행 (예시)");
      cfa("FINANCE", r6((pfBal * 0.072) / 12), "PF 이자 (예시)");
      pfBal -= pfRepay.find(([pm]) => pm === m)?.[1] ?? 0;
      if (m >= "2026-06") cfa("RENT", r6(between(15_000_000, 35_000_000)), "사업주체 귀속 임대료 (예시)");
      if (m === "2026-07" || m === "2026-09") cfa("LEGAL_DEFECT", r6(between(10_000_000, 30_000_000)), "법률자문·하자 (예시)");
    }
    // 수기 예상
    ins("cashflow_forecasts", { id: nid("CFF-", 5), scenario: "ALL", month: "2027-02", account: "OTHER_IN", amount: 400_000_000, note: "부가세 환급 예정 (예시)" });
    ins("cashflow_forecasts", { id: nid("CFF-", 5), scenario: "ALL", month: "2027-05", account: "OTHER_OUT", amount: 250_000_000, note: "관리단 정산 (예시)" });

    // ---------- 하자·민원 ----------
    const defectTypes = ["WATER", "ELEC", "MECH", "FINISH", "WINDOW", "FIRE", "NOISE", "PARKING", "ETC"];
    const stages = ["RECEIVED", "INSPECTED", "ANALYZED", "NEGOTIATING", "REPAIRING", "DONE", "DONE", "DONE", "RECHECK"];
    const descs: Record<string, string> = {
      WATER: "천장 누수 및 결로 발생",
      ELEC: "세대 분전반 차단기 반복 트립",
      MECH: "환기설비 소음 및 작동불량",
      FINISH: "벽체 도장 들뜸, 마감재 파손",
      WINDOW: "창호 기밀 불량으로 외풍 유입",
      FIRE: "감지기 오작동",
      NOISE: "층간·설비 소음 민원",
      PARKING: "주차 유도등·차단기 오작동",
      ETC: "공용부 기타 불편사항",
    };
    for (let i = 0; i < 32; i++) {
      const t = pick(defectTypes);
      const a = pick(assets);
      const stage = pick(stages);
      const recv = dateBetween("2026-04-01", "2026-11-14");
      const done = stage === "DONE" || stage === "RECHECK";
      const kind = t === "NOISE" || t === "PARKING" ? "COMPLAINT" : "DEFECT";
      ins("issues", {
        id: nid("I-", 4),
        asset_id: t === "PARKING" || t === "ETC" ? null : a.id,
        issue_kind: kind,
        defect_type: t,
        received_date: recv,
        reporter: rnd() < 0.6 ? "입주자(예시)" : "관리사무소",
        description: descs[t],
        stage,
        contractor_status: kind === "DEFECT" ? pick(["시공사 접수", "보수일정 협의", "책임 다툼", "보수 완료 통보"]) : null,
        responsible: kind === "DEFECT" ? (rnd() < 0.8 ? "시공사 A" : "사업시행법인") : "관리주체",
        warranty_due: kind === "DEFECT" ? addMonthsD("2026-03-20", pick([24, 36, 60])) : null,
        planned_date: done ? null : addDays(recv, Math.floor(between(14, 60))),
        completed_date: done ? addDays(recv, Math.floor(between(7, 40))) : null,
        cost: r4(between(500_000, 12_000_000)),
        cost_bearer: kind === "DEFECT" ? (rnd() < 0.75 ? "CONTRACTOR" : pick(["DEVELOPER", "UNDECIDED"])) : "DEVELOPER",
        recurrence: stage === "RECHECK" ? 1 : 0,
        complaint_status: kind === "COMPLAINT" ? pick(["접수", "처리중", "처리완료"]) : null,
        note: "예시 데이터",
      });
    }

    // ---------- 법률·리스크 ----------
    const risks: [string, string, string, string, string, number, string | null, string | null, number][] = [
      ["SUBROGATION", "중도금대출 만기 도래 미납세대 대위변제 위험", "C-0005", "IN_PROGRESS", "HIGH", 0, null, "2026-11-25", 0],
      ["MIDDLE_LOAN", "중도금대출 만기연장 협의(금융기관 A)", "금융기관 A", "IN_PROGRESS", "HIGH", 30_000_000, "2026-12", "2026-11-28", 0],
      ["TERMINATION", "잔금 장기미납 세대 계약해지 검토", "다수", "OPEN", "HIGH", 0, null, "2026-12-05", 0],
      ["REFUND_DISPUTE", "해지세대 분양대금 반환 범위 분쟁", "C-0031", "IN_PROGRESS", "MEDIUM", 120_000_000, "2027-03", "2026-12-10", 1],
      ["LAWSUIT", "분양계약 무효확인 소송(1심)", "A-112", "IN_PROGRESS", "HIGH", 180_000_000, "2027-06", "2027-01-15", 1],
      ["COLLECTION_LEGAL", "잔금 미납세대 지급명령 신청", "다수", "OPEN", "MEDIUM", 25_000_000, "2027-01", "2026-12-15", 1],
      ["TRUST_FINANCE", "신탁회사 A 자금집행 순위 협의", "신탁회사 A", "IN_PROGRESS", "HIGH", 0, null, "2026-11-30", 0],
      ["CONTRACT_CHANGE", "할인분양 기존계약자 형평성 민원 대응", "다수", "MONITORING", "MEDIUM", 50_000_000, "2027-02", "2026-12-20", 0],
      ["FUND_APPROVAL", "공사비 분할지급 집행승인(시공사 A)", "D-004", "IN_PROGRESS", "MEDIUM", 0, null, "2026-12-01", 0],
      ["OTHER", "하자보수 책임범위 시공사 협의", "시공사 A", "MONITORING", "LOW", 40_000_000, "2027-04", "2027-01-10", 0],
      ["LAWSUIT", "상가 임차인 원상복구 분쟁(예시)", "B-007", "CLOSED", "LOW", 8_000_000, null, null, 1],
      ["OTHER", "국세 분납 이행 점검", "D-001", "MONITORING", "MEDIUM", 0, null, "2026-12-26", 0],
    ];
    for (const [type, title, related, status, prio, cost, costMonth, next, conf] of risks)
      ins("legal_cases", {
        id: nid("RK-", 3),
        risk_type: type,
        title,
        occurred_date: dateBetween("2026-04-01", "2026-10-31"),
        related_id: related,
        status,
        priority: prio,
        owner: pick(["사업관리 PM A", "재무담당 A"]),
        expected_cost: cost,
        cost_month: costMonth,
        plan: "대응계획 수립 및 주간 점검 (예시)",
        next_action_date: next,
        completed_date: status === "CLOSED" ? "2026-10-20" : null,
        confidential: conf,
        note: "예시 데이터",
      });

    // ---------- 보고서 스냅샷 예시 ----------
    ins("report_snapshots", { report_type: "monthly_exec", title: "월간 임원보고서 (2026-10)", base_date: "2026-10-31", data_version: 1, author: "사업관리 PM A", status: "APPROVED", approved_by: "경영진 A", approved_at: "2026-11-05 10:00:00" });

    ins("audit_logs", { username: "system", role: "SYSTEM", action: "SEED", detail: "예시 데이터 초기 적재" });
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
