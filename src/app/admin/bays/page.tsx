"use client";

import { useEffect, useState } from "react";
import { AdminCrudPage, type CrudField, type CrudRow } from "@/components/admin-crud-page";

const fields: CrudField[] = [
  { key: "bay_code", label: "타석코드", placeholder: "예: A-01" },
  { key: "display_name", label: "표시명", placeholder: "예: A구역 1번 타석" },
  { key: "status", label: "상태", type: "select", options: ["available", "in_use", "waiting", "maintenance"] },
  { key: "memo", label: "메모", placeholder: "운영 메모" }
];

const extraColumns = [{ key: "anydesk", label: "AnyDesk" }];

const fallbackRows: CrudRow[] = [
  {
    id: "fallback-bay-1",
    bay_code: "A-01",
    display_name: "A구역 1번 타석",
    status: "in_use",
    memo: "회원 예약 입장"
  },
  {
    id: "fallback-bay-2",
    bay_code: "B-01",
    display_name: "B구역 1번 타석",
    status: "available",
    memo: "예약 배정 가능"
  }
];

type RemoteDevice = { bayId: string; anydeskId: string; computerName: string };

export default function BaysPage() {
  const [anydeskByBay, setAnydeskByBay] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    let cancelled = false;

    // 원격접속 정보는 부가 정보다. 못 불러와도 타석관리 자체는 그대로 쓸 수 있어야 한다.
    void fetch("/api/admin/remote-access", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { ok?: boolean; devices?: RemoteDevice[] }) => {
        if (cancelled || data.ok === false) return;
        const next: Record<string, Record<string, string>> = {};
        for (const device of data.devices ?? []) {
          next[device.bayId] = { anydesk: `${device.anydeskId} · ${device.computerName}` };
        }
        setAnydeskByBay(next);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminCrudPage
      title="타석관리"
      description="매장별 타석 코드, 표시명, 운영 상태를 Supabase에 저장하고 대시보드 실시간 상태와 연결합니다."
      tableName="bays"
      resource="bays"
      fields={fields}
      initialRows={fallbackRows}
      extraColumns={extraColumns}
      extraValues={anydeskByBay}
    />
  );
}
