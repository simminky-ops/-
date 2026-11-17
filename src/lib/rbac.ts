// 역할 기반 접근권한 매트릭스 (화면·API 공용 — 서버에서 최종 검사)
import type { RoleCode } from "./types";

export type Module =
  | "report" // PART A 사업계획서
  | "dashboard"
  | "assets"
  | "crm"
  | "leasing"
  | "receivables"
  | "feasibility"
  | "cashflow"
  | "operations"
  | "risks"
  | "risks_confidential"
  | "reports"
  | "admin"
  | "data"
  | "approvals";

type Matrix = Record<Module, { read: RoleCode[]; write: RoleCode[] }>;

const INTERNAL: RoleCode[] = ["EXECUTIVE", "PM", "SALES", "LEASING", "FINANCE", "ADMIN"];

export const MATRIX: Matrix = {
  report: { read: ["EXTERNAL", ...INTERNAL], write: ["PM"] },
  dashboard: { read: INTERNAL, write: [] },
  assets: { read: INTERNAL, write: ["PM", "SALES", "FINANCE"] },
  crm: { read: ["EXECUTIVE", "PM", "SALES"], write: ["PM", "SALES"] },
  leasing: { read: ["EXECUTIVE", "PM", "LEASING", "FINANCE"], write: ["PM", "LEASING"] },
  receivables: { read: ["EXECUTIVE", "PM", "FINANCE", "SALES"], write: ["PM", "FINANCE"] },
  feasibility: { read: ["EXECUTIVE", "PM", "FINANCE", "SALES"], write: ["PM", "FINANCE"] },
  cashflow: { read: ["EXECUTIVE", "PM", "FINANCE"], write: ["PM", "FINANCE"] },
  operations: { read: ["EXECUTIVE", "PM", "LEASING", "FINANCE"], write: ["PM", "LEASING"] },
  risks: { read: ["EXECUTIVE", "PM", "FINANCE"], write: ["PM", "FINANCE"] },
  risks_confidential: { read: ["EXECUTIVE", "PM"], write: ["PM"] },
  reports: { read: ["EXECUTIVE", "PM", "FINANCE", "SALES", "LEASING"], write: ["PM", "FINANCE"] },
  admin: { read: ["ADMIN"], write: ["ADMIN"] },
  data: { read: ["EXECUTIVE", "PM", "FINANCE", "SALES", "LEASING", "ADMIN"], write: ["PM", "FINANCE", "ADMIN"] },
  approvals: { read: ["EXECUTIVE", "PM", "FINANCE", "SALES", "LEASING"], write: ["EXECUTIVE"] },
};

export function canRead(role: RoleCode | undefined, m: Module): boolean {
  return !!role && MATRIX[m].read.includes(role);
}
export function canWrite(role: RoleCode | undefined, m: Module): boolean {
  return !!role && MATRIX[m].write.includes(role);
}

/** 승인 없이 보호필드 변경이 바로 반영되는 역할 (승인권자) */
export const APPROVER_ROLES: RoleCode[] = ["EXECUTIVE"];

export const ROLE_DESCRIPTION: Record<RoleCode, string> = {
  EXTERNAL: "승인된 익명 사업계획서와 집계자료(비율·지수)만 조회",
  EXECUTIVE: "사업 전체 KPI·재무현황·보고서 조회 및 변경 승인",
  PM: "사업관리 전반 조회·등록·수정 (중요 금액 변경은 승인 요청)",
  SALES: "분양영업 CRM, 본인 배정 계약 관련 업무",
  LEASING: "임대 및 MD, 건물운영 업무",
  FINANCE: "수납·지급·채무·현금흐름·사업수지 업무",
  ADMIN: "계정·권한·운영로그·백업 등 시스템 관리 (사업 데이터 수정 불가)",
};
