import { requirePage } from "@/lib/server/auth";
import { ENTITIES, ENTITY_NAMES } from "@/lib/entities";
import { canRead, canWrite } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { DocumentCenter } from "@/components/c-documents";

export default async function DocumentsPage() {
  const user = await requirePage("data");
  const entityOptions = ENTITY_NAMES.filter((n) => canRead(user.role, ENTITIES[n].module)).map((n) => ({ name: n, label: ENTITIES[n].label }));
  return (
    <div className="space-y-5">
      <PageHeader code="C02" title="문서 및 첨부파일 관리" desc="계약서·약정서·최고장·임대차계약서·현장사진·법률문서 등을 데이터(자산·계약·채권·리스크 등)와 연결하여 보관합니다." />
      <DocumentCenter entityOptions={entityOptions} canConfidential={canWrite(user.role, "risks_confidential")} canUploadGeneral={canWrite(user.role, "data")} />
    </div>
  );
}
