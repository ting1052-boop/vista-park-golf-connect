import { AdminCrudPage, type CrudField, type CrudRow } from "@/components/admin-crud-page";

const fields: CrudField[] = [
  { key: "bay_code", label: "타석코드", placeholder: "예: A-01" },
  { key: "display_name", label: "표시명", placeholder: "예: A구역 1번 타석" },
  { key: "status", label: "상태", type: "select", options: ["available", "in_use", "waiting", "maintenance"] },
  { key: "memo", label: "메모", placeholder: "운영 메모" }
];

const fallbackRows: CrudRow[] = [
  {
    id: "fallback-bay-1",
    bay_code: "A-01",
    display_name: "A구역 1번 타석",
    status: "in_use",
    memo: "회원 예약 입장"
  },
  {
    id: "fallback-bay-2",
    bay_code: "B-01",
    display_name: "B구역 1번 타석",
    status: "available",
    memo: "예약 배정 가능"
  }
];

export default function BaysPage() {
  return (
    <AdminCrudPage
      title="타석관리"
      description="매장별 타석 코드, 표시명, 운영 상태를 Supabase에 저장하고 대시보드 실시간 상태와 연결합니다."
      tableName="bays"
      resource="bays"
      fields={fields}
      initialRows={fallbackRows}
    />
  );
}
