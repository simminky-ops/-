import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { PageHeader } from "@/components/ui";
import { canWrite } from "@/lib/rbac";
import { FeasibilityView } from "@/components/b06-feasibility";

export default async function FeasibilityPage() {
  const user = await requirePage("feasibility");
  const snap = getSnapshot();
  const unsold = snap.values.views.filter((v) => v.sale_state === "UNSOLD" && v.is_sale_target);
  const avg = (arr: typeof unsold) => (arr.length ? Math.round(arr.reduce((s, v) => s + v.list_price, 0) / arr.length) : 0);
  const ot = unsold.filter((v) => v.facility_type === "OFFICETEL");
  const rt = unsold.filter((v) => v.facility_type === "RETAIL");
  return (
    <div className="space-y-5">
      <PageHeader
        code="B06"
        title="사업수지 및 판매조건 분석"
        desc="손익(발생주의)과 현금흐름을 분리 분석합니다. 기집행·미지급·향후 예정 사업비를 구분하고, 미수금·유예금은 회수시점에 따라 현금흐름 엔진(B07)과 연동되어 중복 집계되지 않습니다."
      />
      <FeasibilityView
        feas={snap.feas}
        cfSummary={{ CONS: snap.cf.CONS.summary, BASE: snap.cf.BASE.summary, OPT: snap.cf.OPT.summary }}
        assumptions={snap.data.settings.scenarios}
        unsold={{
          officetel: { count: ot.length, avgList: avg(ot) },
          retail: { count: rt.length, avgList: avg(rt) },
        }}
        fundingRate={snap.data.settings.project_funding_rate}
        policies={snap.data.policies.filter((p) => p.status !== "RETIRED")}
        canWritePolicy={canWrite(user.role, "feasibility")}
      />
    </div>
  );
}
