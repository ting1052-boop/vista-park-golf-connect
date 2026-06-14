import { LockKeyhole } from "lucide-react";
import { ModulePage } from "@/components/module-page";

export default function AdminLoginPage() {
  return (
    <ModulePage
      title="관리자 로그인"
      eyebrow="본사관리자 · 매장관리자 · 직원"
      description="Supabase Auth 기반으로 관리자 역할을 확인하고 관리자 화면으로 진입합니다."
      icon={LockKeyhole}
      tasks={["이메일/비밀번호 로그인", "역할별 관리자 메뉴 분기", "로그인 후 대시보드 이동"]}
      actions={["로그인", "비밀번호 재설정", "대시보드"]}
    />
  );
}
