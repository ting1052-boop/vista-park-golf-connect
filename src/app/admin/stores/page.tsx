import { AdminCrudPage, type CrudField, type CrudRow } from "@/components/admin-crud-page";

const fields: CrudField[] = [
  { key: "code", label: "매장코드", placeholder: "예: VISTA-SH" },
  { key: "name", label: "매장명", placeholder: "예: 비스타파크골프 시흥점" },
  { key: "address", label: "주소", placeholder: "매장 주소" },
  { key: "phone", label: "전화번호", placeholder: "031-000-0000" },
  { key: "bay_count", label: "타석수", type: "number", placeholder: "예: 5" },
  { key: "status", label: "운영상태", type: "select", options: ["active", "paused", "closed"] }
];

const fallbackRows: CrudRow[] = [
  {
    id: "fallback-store-1",
    code: "VISTA-SH",
    name: "비스타파크골프 시흥점",
    address: "경기도 시흥시 중심상가로 10",
    phone: "031-100-2000",
    bay_count: "5",
    status: "active"
  }
];

export default function StoresPage() {
  return (
    <AdminCrudPage
      title="매장관리"
      description="HH Square가 운영·공급하는 매장의 기본 정보, 주소, 연락처, 운영 상태를 Supabase에 저장하고 관리합니다."
      tableName="stores"
      resource="stores"
      fields={fields}
      initialRows={fallbackRows}
    />
  );
}
