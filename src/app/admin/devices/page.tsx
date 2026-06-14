import { AdminCrudPage, type CrudField, type CrudRow } from "@/components/admin-crud-page";

const fields: CrudField[] = [
  { key: "device_code", label: "장비코드", placeholder: "예: CLUB-001" },
  { key: "name", label: "장비명", placeholder: "예: 공용 클럽 세트 1" },
  { key: "device_type", label: "구분", placeholder: "예: club / ball / tablet" },
  { key: "status", label: "상태", type: "select", options: ["available", "rented", "repair", "retired"] },
  { key: "last_serviced_on", label: "최근점검", placeholder: "2026-06-14" }
];

const fallbackRows: CrudRow[] = [
  {
    id: "fallback-device-1",
    device_code: "CLUB-001",
    name: "공용 클럽 세트 1",
    device_type: "club",
    status: "available",
    last_serviced_on: "2026-05-15"
  }
];

export default function DevicesPage() {
  return (
    <AdminCrudPage
      title="장비관리"
      description="클럽, 공, 현장 접수 태블릿 등 매장 운영 장비의 보유 현황과 점검 상태를 관리합니다."
      tableName="devices"
      resource="devices"
      fields={fields}
      initialRows={fallbackRows}
    />
  );
}
