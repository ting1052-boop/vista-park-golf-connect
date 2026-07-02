"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  FileText,
  Gamepad2,
  Home,
  LayoutDashboard,
  LogOut,
  MapPin,
  MonitorCog,
  PackageCheck,
  ShieldCheck,
  Trophy,
  Users
} from "lucide-react";
import { adminNavItems } from "@/lib/dashboard-data";

const navIconMap = {
  "/admin/dashboard": LayoutDashboard,
  "/admin/reservations": CalendarClock,
  "/admin/automation": MonitorCog,
  "/admin/stores": MapPin,
  "/admin/bays": LayoutDashboard,
  "/admin/devices": PackageCheck,
  "/admin/members": Users,
  "/admin/games": Gamepad2,
  "/admin/rankings": Trophy,
  "/admin/tournaments": Trophy,
  "/admin/join": Users,
  "/admin/reports": FileText
} as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  };

  if (pathname === "/admin/login" || pathname === "/admin/dashboard") {
    return children;
  }

  const activeItem =
    adminNavItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
    adminNavItems[0];

  return (
    <main className="min-h-screen bg-[#eef2ec] text-vista-ink">
      <div className="grid min-h-screen lg:grid-cols-[292px_1fr]">
        <aside className="hidden border-r border-[#d9e3d5] bg-white lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="border-b border-[#e5ece1] px-6 py-6">
              <Link href="/admin/dashboard" className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-md bg-vista-leaf text-white shadow-soft-line">
                  <Home size={23} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-vista-leaf">VISTA</p>
                  <h1 className="text-lg font-extrabold">Park Golf Connect</h1>
                </div>
              </Link>
              <p className="mt-3 text-xs font-semibold text-[#697468]">무인 매장 운영 · 예약 · 장비제어</p>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5" aria-label="관리자 메뉴">
              {adminNavItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = navIconMap[item.href as keyof typeof navIconMap] ?? LayoutDashboard;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex w-full items-center justify-between rounded-md px-4 py-3 text-left text-sm font-bold transition ${
                      isActive
                        ? "bg-vista-leaf text-white shadow-soft-line"
                        : "text-[#4f5b50] hover:bg-vista-fairway hover:text-vista-ink"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={18} aria-hidden="true" />
                      {item.label}
                    </span>
                    {isActive ? <ArrowRight size={16} aria-hidden="true" /> : null}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-[#e5ece1] p-4">
              <div className="rounded-md border border-[#dfe8dc] bg-vista-fairway p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="text-vista-leaf" size={23} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-extrabold">본사관리자</p>
                    <p className="text-xs font-semibold text-[#697468]">권한 적용 완료</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-[#cad8c6] bg-white px-3 py-2 text-sm font-bold text-[#384437]"
                >
                  <LogOut size={16} aria-hidden="true" />
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-[#d9e3d5] bg-white/95 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-vista-leaf">비스타파크골프 시흥점</p>
                <h2 className="truncate text-xl font-extrabold sm:text-2xl">{activeItem.label}</h2>
              </div>
              <div className="hidden rounded-md border border-[#d9e4d6] bg-vista-fairway px-4 py-2 text-sm font-bold text-vista-leaf sm:block">
                본사관리자
              </div>
              <button className="relative grid size-11 place-items-center rounded-md border border-[#d9e4d6] bg-white text-vista-ink">
                <Bell size={20} aria-hidden="true" />
                <span className="sr-only">알림</span>
              </button>
            </div>
            <nav className="flex gap-2 overflow-x-auto border-t border-[#edf2ea] px-4 py-3 sm:px-6 lg:hidden" aria-label="모바일 관리자 메뉴">
              {adminNavItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-md px-3 py-2 text-sm font-extrabold ${
                      isActive ? "bg-vista-leaf text-white" : "border border-[#d9e4d6] bg-white text-[#4f5b50]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>

          {children}
        </section>
      </div>
    </main>
  );
}
