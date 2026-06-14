import { AdminCrudPage, type CrudField, type CrudRow } from "@/components/admin-crud-page";

const fields: CrudField[] = [
  { key: "nickname", label: "닉네임", placeholder: "예: 서진" },
  { key: "phone_last4", label: "전화번호 뒤 4자리", placeholder: "2001" },
  { key: "login_provider", label: "로그인", type: "select", options: ["kakao", "naver", "phone", "manual"] },
  { key: "age_group", label: "연령대", type: "select", options: ["40대 이하", "50대", "60대", "70대", "80대 이상"] },
  { key: "memo", label: "메모", placeholder: "방문/노쇼 메모" }
];

const fallbackRows: CrudRow[] = [
  {
    id: "fallback-member-1",
    nickname: "서진",
    phone_last4: "2001",
    login_provider: "kakao",
    age_group: "60대",
    memo: "주간 예약 선호"
  }
];

export default function MembersPage() {
  return (
    <AdminCrudPage
      title="회원관리"
      description="개인정보를 최소화해 닉네임, 마스킹 전화번호, 로그인 방식, 연령대와 운영 메모 중심으로 관리합니다."
      tableName="members"
      resource="members"
      fields={fields}
      initialRows={fallbackRows}
    />
  );
}
