"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "대시보드", href: "/admin/dashboard" },
  { label: "무인제어", href: "/admin/automation" }
] as const;

export function AdminQuickNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-2 overflow-x-auto border-t border-[#edf2ea] px-4 py-3 sm:px-6 lg:px-8"
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
    </nav>
  );
}
