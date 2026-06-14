import { ClipboardCheck } from "lucide-react";
import { ModulePage } from "@/components/module-page";

export default function MemberReservationsPage() {
  return (
    <ModulePage
      title="내 예약 내역"
      eyebrow="회원 모바일 예약 화면"
      description="회원이 본인의 타석 예약 내역, 예약 상태, 방문 매장, 취소 가능 여부를 확인하는 화면입니다."
      icon={ClipboardCheck}
      tasks={["예약 내역 조회", "예약 확정/승인 대기/취소 상태 확인", "방문 3시간 전 취소 안내", "매장 방문 이력 확인"]}
      actions={["내 예약 보기", "예약 변경", "예약 취소"]}
    />
  );
}
