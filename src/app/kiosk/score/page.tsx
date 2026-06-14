import { ClipboardList } from "lucide-react";
import { ModulePage } from "@/components/module-page";

export default function KioskScorePage() {
  return (
    <ModulePage
      title="현장 스코어 입력"
      eyebrow="수기 기록 보조"
      description="게임 내부 자동 연동 전까지 직원이 확인한 1홀부터 18홀까지의 타수를 수기로 입력합니다."
      icon={ClipboardList}
      kiosk
      tasks={["1홀~18홀 수기 스코어 입력", "참가자별 타수 저장", "경기 완료 처리"]}
      actions={["-1", "저장", "+1"]}
    />
  );
}
