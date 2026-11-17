"use client";
import { useState } from "react";
import { clsx } from "clsx";
import { DataTable, type Col, type FilterDef } from "./data-table";
import { EntityManager } from "./entity-manager";

export interface TabSpec {
  key: string;
  label: string;
  kind: "assetTable" | "entity";
  entity?: "sale_contracts" | "payments" | "deferrals" | "contract_parties" | "assets";
  canWrite?: boolean;
  visible: boolean;
}

export function AssetsTabs({
  rows,
  cols,
  filters,
  initialQuery,
  tabs,
}: {
  rows: Record<string, unknown>[];
  cols: Col[];
  filters: FilterDef[];
  initialQuery: string;
  tabs: TabSpec[];
}) {
  const shown = tabs.filter((t) => t.visible);
  const [tab, setTab] = useState(shown[0]?.key ?? "units");
  const cur = shown.find((t) => t.key === tab) ?? shown[0];
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap gap-1 border-b border-line">
        {shown.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "-mb-px border-b-2 px-3 py-2 text-[13px]",
              t.key === cur?.key ? "border-teal font-semibold text-ink" : "border-transparent text-ink2 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {cur?.kind === "assetTable" && <DataTable rows={rows} cols={cols} filters={filters} initialQuery={initialQuery} maxHeight={640} dense />}
      {cur?.kind === "entity" && cur.entity && (
        <EntityManager
          key={cur.entity}
          entity={cur.entity}
          canWrite={!!cur.canWrite}
          links={cur.entity === "sale_contracts" ? { id: "/assets/{asset_id}" } : cur.entity === "assets" ? { id: "/assets/{id}" } : undefined}
          initialQuery={cur.entity === "assets" ? initialQuery : undefined}
        />
      )}
    </div>
  );
}
