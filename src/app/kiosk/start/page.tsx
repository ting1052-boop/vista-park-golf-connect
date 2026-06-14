import { PlayCircle } from "lucide-react";
import { ModulePage } from "@/components/module-page";

export default function KioskStartPage() {
  return (
    <ModulePage
      title="현장 경기 접수"
      eyebrow="PC 관리자 보조 화면"
      description="게임 내부 자동 연동 없이 현장에서 타석과 회원을 확인하고 PC 관리자 기록으로 넘깁니다."
      icon={PlayCircle}
      kiosk
      tasks={["현장 경기 접수", "타석 선택", "PC 관리자 기록 연결"]}
      actions={["접수", "타석 선택", "취소"]}
    />
  );
}
