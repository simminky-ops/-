import type { Module } from "./rbac";

export interface NavItem {
  code: string;
  href: string;
  label: string;
  module: Module;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "PART A · 사업계획서",
    items: [
      { code: "A01", href: "/report", label: "Executive Summary", module: "report" },
      { code: "A02", href: "/report/overview", label: "사업개요", module: "report" },
      { code: "A03", href: "/report/location", label: "입지 및 상권분석", module: "report" },
      { code: "A04", href: "/report/status", label: "분양·임대·사업현황", module: "report" },
      { code: "A05", href: "/report/strategy", label: "판매·임대 활성화 전략", module: "report" },
      { code: "A06", href: "/report/financial", label: "사업수지·채무 상환계획", module: "report" },
      { code: "A07", href: "/report/roadmap", label: "사업 정상화 로드맵", module: "report" },
    ],
  },
  {
    title: "PART B · 운영관리",
    items: [
      { code: "B01", href: "/dashboard", label: "통합 대시보드", module: "dashboard" },
      { code: "B02", href: "/assets", label: "호실 및 분양계약", module: "assets" },
      { code: "B03", href: "/crm", label: "분양영업 CRM", module: "crm" },
      { code: "B04", href: "/leasing", label: "임대 및 MD", module: "leasing" },
      { code: "B05", href: "/receivables", label: "미수금 및 채권", module: "receivables" },
      { code: "B06", href: "/feasibility", label: "사업수지·판매조건", module: "feasibility" },
      { code: "B07", href: "/cashflow", label: "36개월 현금흐름·채무", module: "cashflow" },
      { code: "B08", href: "/operations", label: "건물운영·하자", module: "operations" },
      { code: "B09", href: "/risks", label: "법률·금융·리스크", module: "risks" },
      { code: "B10", href: "/reports", label: "성과분석·보고서", module: "reports" },
      { code: "B11", href: "/admin", label: "사용자·보안·권한", module: "admin" },
    ],
  },
  {
    title: "PART C · 공통 데이터",
    items: [
      { code: "C01", href: "/data", label: "Excel 업로드·다운로드", module: "data" },
      { code: "C02", href: "/documents", label: "문서·첨부파일", module: "data" },
      { code: "C03", href: "/approvals", label: "변경이력·승인관리", module: "approvals" },
      { code: "C04", href: "/alerts", label: "알림·업무기한", module: "dashboard" },
    ],
  },
];
