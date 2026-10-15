import { AdminCrudPage, type CrudField } from "@/components/admin-crud-page";
import { getAdminContext } from "@/lib/admin-context";
import { SONGDO_STORE_ID } from "@/lib/automation/device-map";

const fields: CrudField[] = [
  { key: "starts_at", label: "예약시간", type: "datetime-local" },
  { key: "guest_name", label: "고객명", placeholder: "예: 서진 / 010-****-2001" },
  { key: "bay_code", label: "타석", placeholder: "예: A-01" },
  { key: "party_size", label: "인원", type: "number", placeholder: "1" },
  { key: "channel", label: "접수경로", type: "select", options: ["member_app", "phone", "walk_in", "admin"] },
  { key: "status", label: "상태", type: "select", options: ["requested", "confirmed", "checked_in", "completed", "cancelled", "no_show"] },
  { key: "approval_policy", label: "승인정책", type: "select", options: ["자동 확정", "매장 승인"] },
  { key: "memo", label: "메모", placeholder: "예약 메모" }
];

export default async function ReservationsPage() {
  const context = await getAdminContext();
  if (context.storeId === SONGDO_STORE_ID) {
    return (
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <h2 className="text-xl font-extrabold">VISTA 예약 미사용</h2>
        <p className="mt-2 text-sm text-[#697468]">송도파크자이는 VISTA에서 예약을 관리하지 않습니다.</p>
      </section>
    );
  }
  return (
    <AdminCrudPage
      key={context.storeId}
      reservationStoreId={context.storeId}
      title="예약관리"
      description="회원 앱, 전화, 현장 접수로 들어온 타석 예약을 등록하고 타석 배정, 확정, 취소, 노쇼 상태를 Supabase에 저장합니다."
      tableName="reservations"
      resource="reservations"
      fields={fields}
      initialRows={[]}
    />
  );
}
