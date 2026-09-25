"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const items = [
  { label: "대시보드", href: "/admin/dashboard" },
  { label: "무인제어", href: "/admin/automation" }
] as const;

export function AdminQuickNav() {
  const pathname = usePathname();
  const router = useRouter();

  // 사이드바의 로그아웃은 lg 이상에서만 보인다. 모바일에는 로그아웃할 곳이 없어서
  // 한 번 로그인한 계정에서 다른 계정으로 바꿀 수 없었다.
  const handleLogout = async () => {
    await createBrowserSupabaseClient().auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <nav
      className="flex items-center gap-2 overflow-x-auto border-t border-[#edf2ea] px-4 py-3 sm:px-6 lg:px-8"
      aria-label="관리자 빠른 이동"
    >
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`shrink-0 rounded-md px-4 py-2 text-sm font-extrabold transition focus:outline-none focus:ring-2 focus:ring-vista-leaf sm:text-base ${
              isActive ? "bg-vista-leaf text-white" : "border border-[#d9e4d6] bg-white text-[#4f5b50] hover:bg-vista-fairway"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={handleLogout}
        className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border border-[#d9e4d6] bg-white px-3 py-2 text-sm font-bold text-[#4f5b50] hover:bg-vista-fairway focus:outline-none focus:ring-2 focus:ring-vista-leaf lg:hidden"
      >
        <LogOut size={16} aria-hidden="true" />
        로그아웃
      </button>
    </nav>
  );
}
