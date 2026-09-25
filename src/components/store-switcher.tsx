"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { AdminStoreOption } from "@/lib/admin-context";

// 본사관리자 전용 매장 선택. 고르면 서버에 쿠키를 저장하고 화면을 새로고침한다.
// 매장 목록이 없거나(=본사 아님) 1개뿐이면 그냥 매장 이름만 보여준다.
export function StoreSwitcher({
  stores,
  currentStoreId,
  currentStoreName
}: {
  stores: AdminStoreOption[];
  currentStoreId: string;
  currentStoreName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (stores.length <= 1) {
    return <p className="text-sm font-bold text-vista-leaf">{currentStoreName}</p>;
  }

  const handleChange = async (storeId: string) => {
    if (storeId === currentStoreId || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/select-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId })
      });
      if (!res.ok) {
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label="매장 선택"
        value={currentStoreId}
        disabled={busy}
        onChange={(event) => void handleChange(event.target.value)}
        className="appearance-none rounded-md border border-[#cfe0c9] bg-vista-fairway py-1 pl-2 pr-7 text-sm font-bold text-vista-leaf disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-vista-leaf"
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 text-vista-leaf" aria-hidden="true" />
    </div>
  );
}
