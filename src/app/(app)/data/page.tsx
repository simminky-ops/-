import { requirePage } from "@/lib/server/auth";
import { ENTITIES, ENTITY_NAMES } from "@/lib/entities";
import { canRead, canWrite } from "@/lib/rbac";
import { Card, Note, PageHeader } from "@/components/ui";
import { DataCenter } from "@/components/c-data-center";

export default async function DataPage() {
  const user = await requirePage("data");
  const entities = ENTITY_NAMES.filter((n) => canRead(user.role, ENTITIES[n].module)).map((n) => ({
    name: n,
    label: ENTITIES[n].label,
    canWrite: canWrite(user.role, ENTITIES[n].module),
    fields: ENTITIES[n].fields.length,
  }));
  return (
    <div className="space-y-5">
      <PageHeader code="C01" title="Excel 업로드·다운로드" desc="통합 데이터베이스의 각 데이터를 Excel로 내려받거나, 양식에 맞춰 일괄 등록·수정합니다." />
      <Note>
        <b>서버 저장 기능입니다.</b> 이 화면의 업로드는 브라우저 모의기능이 아니라 서버의 데이터베이스(SQLite, data/ad-project.db)에 실제로 저장되며, 대시보드·현금흐름·사업수지 계산에 즉시 반영됩니다. 모든 반영 작업은 감사로그에 기록됩니다.
      </Note>
      <DataCenter entities={entities} />
      <Card title="업로드 검증 규칙">
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] text-ink2 md:grid-cols-2 [&_li]:ml-4 [&_li]:list-disc">
          <li>
            <b>형식 오류</b>: 숫자·날짜(YYYY-MM-DD)·월(YYYY-MM)·선택값(코드 또는 화면 라벨) 형식과 최소/최대값 검사
          </li>
          <li>
            <b>필수값</b>: 양식 ‘작성안내’ 시트의 필수 항목 누락 시 오류
          </li>
          <li>
            <b>중복</b>: 파일 내 동일 ID 중복, 기존에 없는 ID 수정 시도, 동일 수납내역(계약·구분·금액·일자) 중복
          </li>
          <li>
            <b>금액 불일치</b>: 분양계약의 분양가−할인금액 ≠ 공급금액, 계약금+중도금+잔금 ≠ 공급금액, 판매조건 비율 합계 ≠ 100%
          </li>
          <li>
            <b>참조 무결성</b>: 존재하지 않는 자산·계약·채무 ID, 동일 호실 유효계약 중복, 임대기간 중복
          </li>
          <li>
            <b>승인 통제</b>: 기존 건의 중요 금액·계약정보(★) 변경은 즉시 반영되지 않고 경영진 승인 대기로 등록
          </li>
          <li>
            <b>처리 방식</b>: ID를 비우면 신규(자동 채번), 기존 ID 입력 시 수정 · 오류가 1건이라도 있으면 전체 미반영
          </li>
          <li>
            <b>파일 제한</b>: .xlsx, 10MB 이하, 첫 번째 시트 1행을 헤더로 인식
          </li>
        </ul>
      </Card>
    </div>
  );
}
