"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { clsx } from "clsx";
import { fmtArea, fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { usePrefs } from "./providers";
import { Badge } from "./ui";

export interface Col {
  key: string;
  label: string;
  kind?: "text" | "money" | "pct" | "date" | "num" | "area" | "code" | "bool";
  map?: Record<string, string>; // 코드 → 라벨
  tone?: Record<string, string>; // 코드 → 배지 톤
  link?: string; // "/assets/{id}" 형태
  hidden?: boolean;
  sum?: boolean; // 합계행 표시
}

export interface FilterDef {
  key: string;
  label: string;
  options: Record<string, string>;
}

export function DataTable({
  rows,
  cols,
  filters = [],
  pageSize = 50,
  initialQuery = "",
  onRowClick,
  rowKey = "id",
  maxHeight = 560,
  dense,
  toolbar,
  emptyText = "데이터가 없습니다.",
}: {
  rows: Record<string, unknown>[];
  cols: Col[];
  filters?: FilterDef[];
  pageSize?: number;
  initialQuery?: string;
  onRowClick?: (row: Record<string, unknown>) => void;
  rowKey?: string;
  maxHeight?: number;
  dense?: boolean;
  toolbar?: React.ReactNode;
  emptyText?: string;
}) {
  const { unit } = usePrefs();
  const [q, setQ] = useState(initialQuery);
  const [f, setF] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const visible = cols.filter((c) => !c.hidden);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let r = rows.filter((row) => Object.entries(f).every(([k, v]) => !v || String(row[k] ?? "") === v));
    if (ql)
      r = r.filter((row) =>
        visible.some((c) => {
          const v = row[c.key];
          const s = c.map ? (c.map[String(v)] ?? String(v ?? "")) : String(v ?? "");
          return s.toLowerCase().includes(ql);
        }),
      );
    if (sort) {
      r = [...r].sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "ko")) * sort.dir;
      });
    }
    return r;
  }, [rows, f, q, sort, visible]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const pageRows = filtered.slice(cur * pageSize, (cur + 1) * pageSize);
  const hasSum = visible.some((c) => c.sum);

  const cell = (c: Col, row: Record<string, unknown>) => {
    const v = row[c.key];
    let content: React.ReactNode;
    switch (c.kind) {
      case "money":
        content = <span className="num">{fmtMoney(v as number, unit, false)}</span>;
        break;
      case "pct":
        content = <span className="num">{v === null || v === undefined ? "-" : `${fmtNum(v as number, 1)}%`}</span>;
        break;
      case "num":
        content = <span className="num">{fmtNum(v as number)}</span>;
        break;
      case "area":
        content = <span className="num">{fmtArea(v as number)}</span>;
        break;
      case "date":
        content = <span className="num">{fmtDate(v as string)}</span>;
        break;
      case "bool":
        content = Number(v) ? "예" : "-";
        break;
      default: {
        const label = c.map ? (c.map[String(v)] ?? (v as string) ?? "-") : ((v as string) ?? "-");
        content = c.tone && v !== null && v !== undefined ? <Badge tone={c.tone[String(v)] ?? "neutral"}>{label}</Badge> : label;
      }
    }
    if (c.link && v !== null && v !== undefined && v !== "") {
      const href = c.link.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(row[k] ?? "")));
      return (
        <Link href={href} className="font-medium text-teal hover:underline" onClick={(e) => e.stopPropagation()}>
          {content}
        </Link>
      );
    }
    return content;
  };

  return (
    <div>
      <div className="no-print mb-2 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="검색"
          className="input !w-52"
        />
        {filters.map((fd) => (
          <select
            key={fd.key}
            value={f[fd.key] ?? ""}
            onChange={(e) => {
              setF({ ...f, [fd.key]: e.target.value });
              setPage(0);
            }}
            className="input !w-auto"
            aria-label={fd.label}
          >
            <option value="">{fd.label}: 전체</option>
            {Object.entries(fd.options).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        ))}
        <span className="text-xs text-ink3">
          {filtered.length.toLocaleString()}건{visible.some((c) => c.kind === "money") && ` · 금액단위 ${{ WON: "원", MAN: "만원", EOK: "억원" }[unit]}`}
        </span>
        <div className="ml-auto flex items-center gap-2">{toolbar}</div>
      </div>
      <div className="overflow-auto rounded-md border border-line" style={{ maxHeight }}>
        <table className={clsx("tbl", dense && "[&_td]:!py-1")}>
          <thead>
            <tr>
              {visible.map((c) => (
                <th
                  key={c.key}
                  className={clsx("cursor-pointer select-none", ["money", "pct", "num", "area"].includes(c.kind ?? "") && "r")}
                  onClick={() => setSort(sort?.key === c.key ? { key: c.key, dir: sort.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {c.label}
                    {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={String(row[rowKey] ?? i)} onClick={() => onRowClick?.(row)} className={onRowClick ? "cursor-pointer" : ""}>
                {visible.map((c) => (
                  <td key={c.key} className={clsx(["money", "pct", "num", "area"].includes(c.kind ?? "") && "r")}>
                    {cell(c, row)}
                  </td>
                ))}
              </tr>
            ))}
            {!pageRows.length && (
              <tr>
                <td colSpan={visible.length} className="py-8 text-center text-ink3">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
          {hasSum && filtered.length > 0 && (
            <tfoot>
              <tr className="bg-[#f7f9fb] font-semibold">
                {visible.map((c, i) => (
                  <td key={c.key} className={clsx("border-t border-line", c.sum && "r")}>
                    {c.sum ? <span className="num">{fmtMoney(filtered.reduce((s, r) => s + (Number(r[c.key]) || 0), 0), unit, false)}</span> : i === 0 ? "합계" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {pages > 1 && (
        <div className="no-print mt-2 flex items-center justify-end gap-1 text-xs">
          <button disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded border border-line px-2 py-1 disabled:opacity-40">
            이전
          </button>
          <span className="px-2">
            {cur + 1} / {pages}
          </span>
          <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded border border-line px-2 py-1 disabled:opacity-40">
            다음
          </button>
        </div>
      )}
    </div>
  );
}
