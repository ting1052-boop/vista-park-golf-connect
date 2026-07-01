import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/member/app",
    name: "VISTA Park Golf Connect",
    short_name: "VISTA Connect",
    description: "스크린파크골프 매장 예약, 타석관리, 무인제어 운영 앱",
    start_url: "/member/app",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#eef2ec",
    theme_color: "#4E8969",
    orientation: "portrait",
    categories: ["business", "productivity", "sports"],
    lang: "ko",
    prefer_related_applications: false,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    shortcuts: [
      {
        name: "회원 예약",
        short_name: "예약",
        description: "고객 예약 화면으로 이동",
        url: "/member/app",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "관리자 대시보드",
        short_name: "관리",
        description: "매장 관리자 화면으로 이동",
        url: "/admin/dashboard",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
      }
    ]
  };
}
