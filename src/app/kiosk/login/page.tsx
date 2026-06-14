import { Phone } from "lucide-react";
import { ModulePage } from "@/components/module-page";

export default function KioskLoginPage() {
  return (
    <ModulePage
      title="현장 로그인"
      eyebrow="회원 앱 보조 화면"
      description="회원 앱 사용이 어려운 고객을 위해 현장에서 큰 버튼과 큰 입력 영역으로 전화번호 확인을 제공합니다."
      icon={Phone}
      kiosk
      tasks={["전화번호 입력", "서버 API에서 전화번호 해시 비교", "회원 정보는 마스킹 표시"]}
      actions={["전화번호 입력", "현장 접수", "확인"]}
    />
  );
}
