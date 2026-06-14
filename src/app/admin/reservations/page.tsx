import { AdminCrudPage, type CrudField, type CrudRow } from "@/components/admin-crud-page";

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

const fallbackRows: CrudRow[] = [
  {
    id: "fallback-reservation-1",
    starts_at: "2026-06-14T09:30",
    guest_name: "서진 / 010-****-2001",
    bay_code: "A-01",
    party_size: "2",
    channel: "member_app",
    status: "checked_in",
    approval_policy: "자동 확정",
    memo: "회원 앱 예약"
  }
];

export default function ReservationsPage() {
  return (
    <AdminCrudPage
      title="예약관리"
      description="회원 앱, 전화, 현장 접수로 들어온 타석 예약을 등록하고 타석 배정, 확정, 취소, 노쇼 상태를 Supabase에 저장합니다."
      tableName="reservations"
      resource="reservations"
      fields={fields}
      initialRows={fallbackRows}
    />
  );
}
