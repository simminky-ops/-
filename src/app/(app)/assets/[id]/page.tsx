import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { all } from "@/lib/server/db";
import { canRead, canWrite } from "@/lib/rbac";
import { LEASE_STATE_LABEL, PAY_STATE_LABEL, SALE_STATE_LABEL } from "@/lib/calc/analytics";
import { agingBucket } from "@/lib/calc/contracts";
import { CONTRACT_STATUS_LABEL, FACILITY_LABEL, PAYMENT_TYPE_LABEL } from "@/lib/types";
import { ENTITIES } from "@/lib/entities";
import { fmtArea, fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { Badge, ButtonLink, Card, Grid, Note, PageHeader, Stat } from "@/components/ui";
import { Money, Pct } from "@/components/money";
import { DataTable } from "@/components/data-table";
import { EntityManager } from "@/components/entity-manager";
import { AssetDocuments } from "@/components/b02-documents";

const NEG = ENTITIES.receivables.fields.find((f) => f.key === "negotiation_status")!.options!;
const ACT = ENTITIES.collection_actions.fields.find((f) => f.key === "action_type")!.options!;
const DEF_STATUS = ENTITIES.deferrals.fields.find((f) => f.key === "status")!.options!;

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("assets");
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const snap = getSnapshot();
  const { data, values } = snap;
  const asset = data.assets.find((a) => a.id === id);
  if (!asset) notFound();
  const view = values.views.find((v) => v.id === id)!;
  const contracts = data.contracts.filter((c) => c.asset_id === id).sort((a, b) => a.contract_date.localeCompare(b.contract_date));
  const calcBy = new Map(values.calcs.map((c) => [c.contract.id, c]));
  const recs = data.receivables.filter((r) => r.asset_id === id);
  const recIds = new Set(recs.map((r) => r.id));
  const actions = data.actions.filter((a) => recIds.has(a.receivable_id));
  const seeFin = canRead(user.role, "receivables");
  const seeLease = canRead(user.role, "leasing");
  const seeOps = canRead(user.role, "operations");

  const relatedIds = [id, ...contracts.map((c) => c.id), ...recs.map((r) => r.id), ...data.deferrals.filter((d) => d.asset_id === id).map((d) => d.id)];
  const logs = all<{ id: number; at: string; username: string; role: string; action: string; entity_type: string; entity_id: string; after_json: string | null; detail: string | null }>(
    `SELECT id, at, username, role, action, entity_type, entity_id, after_json, detail FROM audit_logs WHERE entity_id IN (${relatedIds.map(() => "?").join(",")}) ORDER BY id DESC LIMIT 100`,
    ...relatedIds,
  ).map((l) => {
    let changed = "";
    try {
      changed = l.after_json ? Object.keys(JSON.parse(l.after_json)).slice(0, 6).join(", ") : "";
    } catch {
      changed = "";
    }
    return { id: l.id, at: fmtDateTime(l.at), username: l.username, action: l.action, entity_type: ENTITIES[l.entity_type as keyof typeof ENTITIES]?.label ?? l.entity_type, entity_id: l.entity_id, changed, detail: l.detail ?? "" };
  });

  const saleTone = view.sale_state === "UNSOLD" ? "bad" : view.sale_state === "COMPLETED" ? "good" : "info";
  const payTone = view.pay_state === "OVERDUE" ? "bad" : view.pay_state === "DEFERRED" ? "warn" : view.pay_state === "PAID" ? "good" : "neutral";
  const leaseTone = view.lease_state === "VACANT" ? "bad" : view.lease_state === "OPEN" ? "good" : view.lease_state === "NA" ? "neutral" : "info";

  return (
    <div className="space-y-5">
      <PageHeader
        code="B02"
        title={`자산 상세 · ${asset.id}`}
        desc={`${FACILITY_LABEL[asset.facility_type]} · ${asset.floor}층 · ${asset.usage ?? ""} — 계약·수납·유예·채권·임대·하자·재판매 이력을 한 번에 확인합니다. 해지된 원계약과 수납 이력도 보존됩니다.`}
        actions={<ButtonLink href="/assets">← 목록</ButtonLink>}
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={saleTone}>분양: {SALE_STATE_LABEL[view.sale_state]}</Badge>
        <Badge tone={payTone}>수납: {PAY_STATE_LABEL[view.pay_state]}</Badge>
        <Badge tone={leaseTone}>임대: {LEASE_STATE_LABEL[view.lease_state]}</Badge>
        {view.terminated_count > 0 && <Badge tone="warn">해지이력 {view.terminated_count}건</Badge>}
        {view.is_resale ? <Badge tone="info">재판매 호실</Badge> : null}
      </div>

      <Grid cols={6}>
        <Stat label="전용 / 계약면적" value={fmtArea(asset.exclusive_area)} sub={`계약 ${fmtArea(asset.contract_area)}`} />
        <Stat label="최초 분양가" value={<Money v={asset.list_price} />} sub={<>현재가 <Money v={asset.current_price} /></>} />
        <Stat label="유효계약 공급금액" value={<Money v={view.supply_price} />} sub={view.discount_rate ? <>할인율 <Pct v={view.discount_rate} /></> : "할인 없음"} />
        <Stat label="납부완료(원금)" value={<Money v={view.paid_total} />} />
        <Stat label="잔금 미납 / 유예" value={<Money v={view.balance_unpaid} />} sub={<>유예 <Money v={view.deferral_outstanding} /></>} tone={view.balance_unpaid > 0 ? "bad" : undefined} />
        <Stat label="연체료(발생)" value={<Money v={view.late_fee} unit="MAN" />} sub={view.overdue_days ? `연체 ${view.overdue_days}일 (${agingBucket(view.overdue_days)})` : "연체 없음"} tone={view.overdue_days ? "warn" : undefined} />
      </Grid>

      {/* 재판매 체인 */}
      <Card title="계약 이력 · 재판매 체인" sub="원계약 → 해지 → 재판매 순서. 원본 거래기록은 삭제되지 않습니다.">
        {contracts.length === 0 ? (
          <p className="text-sm text-ink3">계약 이력이 없습니다 (미분양).</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {contracts.map((c, i) => (
              <span key={c.id} className="flex items-center gap-2">
                {i > 0 && <span className="text-ink3">→</span>}
                <span className={`rounded-md border px-2.5 py-1.5 ${c.status === "TERMINATED" ? "border-bad/30 bg-bad-bg" : "border-teal/30 bg-teal-soft"}`}>
                  <b>{c.id}</b> · {fmtDate(c.contract_date)} · {CONTRACT_STATUS_LABEL[c.status]}
                  {c.is_resale ? " · 재판매" : ""}
                  {c.prev_contract_id ? ` (직전 ${c.prev_contract_id})` : ""}
                  {c.terminated_at ? ` · 해지 ${c.terminated_at}` : ""}
                </span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {contracts.map((c) => {
        const cc = calcBy.get(c.id);
        const pays = data.payments.filter((p) => p.contract_id === c.id).map((p) => ({ ...p }));
        const defs = data.deferrals.filter((d) => d.contract_id === c.id);
        return (
          <Card
            key={c.id}
            title={
              <span className="flex items-center gap-2">
                계약 {c.id} <Badge tone={c.status === "TERMINATED" ? "bad" : c.status === "COMPLETED" ? "good" : "info"}>{CONTRACT_STATUS_LABEL[c.status]}</Badge>
                {c.is_resale ? <Badge tone="info">재판매</Badge> : null}
              </span>
            }
            sub={`계약일 ${c.contract_date} · 영업담당 ${c.sales_manager ?? "-"} · 계약자 관리ID ${c.party_id ?? "-"} (개인정보는 계약자 탭에서 권한별 조회)`}
          >
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] md:grid-cols-4">
              <Field k="계약시 분양가" v={<Money v={c.list_price_at_contract} />} />
              <Field k="할인금액" v={<Money v={c.discount_amount} />} />
              <Field k="공급금액" v={<Money v={c.supply_price} />} />
              <Field k="계약금 / 중도금 / 잔금" v={<><Money v={c.deposit_amount} /> / <Money v={c.middle_amount} /> / <Money v={c.balance_amount} /></>} />
              <Field k="잔금 납부기한" v={c.balance_due_date ?? "-"} />
              <Field k="연체이율" v={`연 ${fmtNum(c.late_fee_rate, 1)}%`} />
              <Field k="중도금대출 만기" v={c.middle_loan_maturity ?? "-"} />
              <Field k="중도금 대납이자" v={<Money v={c.middle_loan_interest} unit="MAN" />} />
              {cc && (
                <>
                  <Field k="납부원금 합계" v={<Money v={cc.principalPaid} />} />
                  <Field k="미수(공급금액 기준)" v={<Money v={cc.outstanding} />} />
                  <Field k="유예 미상환" v={<Money v={cc.deferralOutstanding} />} />
                  <Field k="해지 환급" v={<Money v={cc.refund} />} />
                </>
              )}
              {c.status === "TERMINATED" && <Field k="해지일 / 사유" v={`${c.terminated_at ?? "-"} · ${c.termination_reason ?? "-"}`} />}
            </div>

            {seeFin && (
              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold text-ink2">수납 이력</div>
                <DataTable
                  rows={pays}
                  dense
                  maxHeight={260}
                  pageSize={30}
                  cols={[
                    { key: "id", label: "수납 ID" },
                    { key: "paid_date", label: "수납일", kind: "date" },
                    { key: "pay_type", label: "구분", map: PAYMENT_TYPE_LABEL },
                    { key: "amount", label: "금액", kind: "money", sum: true },
                    { key: "deferral_id", label: "유예 ID" },
                    { key: "method", label: "방법" },
                    { key: "note", label: "비고" },
                  ]}
                />
              </div>
            )}

            {seeFin && defs.length > 0 && (
              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold text-ink2">잔금유예</div>
                <DataTable
                  rows={defs.map((d) => ({ ...d, basisLabel: d.basis === "SUPPLY" ? "공급금액 대비" : "잔금 대비" }))}
                  dense
                  maxHeight={200}
                  cols={[
                    { key: "id", label: "유예 ID" },
                    { key: "basisLabel", label: "산정기준" },
                    { key: "deferral_rate", label: "유예율", kind: "pct" },
                    { key: "deferred_amount", label: "유예금액", kind: "money" },
                    { key: "interest_rate", label: "유예이자율", kind: "pct" },
                    { key: "start_date", label: "시작일", kind: "date" },
                    { key: "maturity_date", label: "만기일", kind: "date" },
                    { key: "status", label: "상태", map: DEF_STATUS },
                  ]}
                />
              </div>
            )}

            {seeFin && cc && cc.lateFee.segments.length > 0 && (
              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold text-ink2">
                  연체료 산정내역 — 연체원금 × 연 {fmtNum(c.late_fee_rate, 1)}% × 일수 ÷ 365 (기산일: 납부기한 {c.balance_due_date} 다음날, 만기 전 유예금 제외, 납부일부터 원금 차감)
                </div>
                <DataTable
                  rows={cc.lateFee.segments.map((s, i) => ({ id: i, ...s }))}
                  dense
                  maxHeight={220}
                  cols={[
                    { key: "from", label: "구간 시작(기산 전일)", kind: "date" },
                    { key: "to", label: "구간 종료", kind: "date" },
                    { key: "days", label: "일수", kind: "num" },
                    { key: "principal", label: "연체원금", kind: "money" },
                    { key: "fee", label: "연체료", kind: "money", sum: true },
                  ]}
                />
                <p className="mt-1 text-xs text-ink2">
                  발생 연체료 <Money v={cc.lateFee.fee} unit="WON" /> · 납부 <Money v={cc.lateFeePaid} unit="WON" /> · 미납 <Money v={cc.lateFeeUnpaid} unit="WON" /> · 현재 연체원금 <Money v={cc.overduePrincipal} /> ({cc.overdueDays}일)
                </p>
              </div>
            )}
          </Card>
        );
      })}

      {seeFin && (
        <Card title="채권(미수금) 관리 기록 · 회수조치 이력" sub="최고장·독촉·납부약정 등 회수 활동">
          {recs.length === 0 ? (
            <p className="text-sm text-ink3">채권 관리 기록이 없습니다.</p>
          ) : (
            <DataTable
              rows={recs.map((r) => ({ ...r }))}
              dense
              maxHeight={220}
              cols={[
                { key: "id", label: "채권관리 ID" },
                { key: "contract_id", label: "계약 ID" },
                { key: "billed_amount", label: "청구 확정액", kind: "money" },
                { key: "due_date", label: "납부기한", kind: "date" },
                { key: "notice_count", label: "최고장 차수", kind: "num" },
                { key: "negotiation_status", label: "회수협의", map: NEG },
                { key: "expected_amount", label: "회수예정액", kind: "money" },
                { key: "expected_date", label: "회수예정일", kind: "date" },
                { key: "legal_action", label: "법률조치", kind: "bool" },
                { key: "status", label: "상태", map: { OPEN: "관리중", CLOSED: "종결" } },
              ]}
            />
          )}
          {actions.length > 0 && (
            <div className="mt-3">
              <DataTable
                rows={actions.map((a) => ({ ...a }))}
                dense
                maxHeight={200}
                cols={[
                  { key: "action_date", label: "조치일", kind: "date" },
                  { key: "receivable_id", label: "채권관리 ID" },
                  { key: "action_type", label: "조치유형", map: ACT },
                  { key: "round", label: "차수", kind: "num" },
                  { key: "note", label: "내용" },
                ]}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-ink3">채권 기록·회수조치 등록은 아래 관리 영역 또는 B05 미수금 및 채권관리에서 할 수 있습니다.</p>
        </Card>
      )}

      <Card title="관련 데이터 등록·수정" sub="이 호실로 필터링된 관리 영역입니다. 중요 금액 변경은 승인 절차를 거칩니다.">
        <div className="space-y-6">
          <Section title="분양계약">
            <EntityManager entity="sale_contracts" canWrite={canWrite(user.role, "assets")} filterBy={{ key: "asset_id", value: id }} compact />
          </Section>
          {seeFin && (
            <>
              <Section title="수납내역">
                <EntityManager entity="payments" canWrite={canWrite(user.role, "receivables")} filterBy={{ key: "asset_id", value: id }} compact />
              </Section>
              <Section title="잔금유예">
                <EntityManager entity="deferrals" canWrite={canWrite(user.role, "receivables")} filterBy={{ key: "asset_id", value: id }} compact />
              </Section>
              <Section title="채권(미수금) 관리">
                <EntityManager entity="receivables" canWrite={canWrite(user.role, "receivables")} filterBy={{ key: "asset_id", value: id }} compact />
              </Section>
            </>
          )}
          {seeLease && asset.leasable ? (
            <Section title="임대차 / MD">
              <EntityManager entity="leases" canWrite={canWrite(user.role, "leasing")} filterBy={{ key: "asset_id", value: id }} compact />
            </Section>
          ) : null}
          {seeOps && (
            <Section title="하자·민원">
              <EntityManager entity="issues" canWrite={canWrite(user.role, "operations")} filterBy={{ key: "asset_id", value: id }} compact />
            </Section>
          )}
        </div>
      </Card>

      <Card title="첨부 문서" sub="계약서·수납증빙·하자사진 등 (권한별 열람, 다운로드 이력 기록)">
        <AssetDocuments entityType="assets" entityId={id} canWrite={canWrite(user.role, "assets")} />
      </Card>

      <Card title="변경이력 (감사로그)" sub="이 호실 및 관련 계약·채권·유예 ID의 최근 100건">
        <DataTable
          rows={logs}
          dense
          maxHeight={300}
          cols={[
            { key: "at", label: "일시" },
            { key: "username", label: "사용자" },
            { key: "action", label: "작업" },
            { key: "entity_type", label: "대상" },
            { key: "entity_id", label: "ID" },
            { key: "changed", label: "변경 항목" },
            { key: "detail", label: "비고" },
          ]}
          emptyText="기록된 변경이력이 없습니다 (예시 데이터 초기 적재분은 개별 이력 없음)."
        />
      </Card>

      <Note>
        모든 금액은 예시 데이터입니다. 연체료는 계약별 적용 이율·기산일·실제 일수(365일 기준)로 자동 계산되며, 실제 약정 조건(일할/월할, 상한 등)이 다르면 계약 조건에 맞게 산식을 조정해야 합니다.{" "}
        <Link href="/receivables" className="text-teal underline">
          B05 미수금 및 채권관리
        </Link>
      </Note>
    </div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink3">{k}</div>
      <div className="font-medium text-ink">{v}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold text-ink">{title}</div>
      {children}
    </div>
  );
}
