export type AppRole = "head_admin" | "store_manager" | "staff" | "member";

export type MemberSocialProvider = "kakao" | "naver";

export type BayStatus = "available" | "in_use" | "cleaning" | "maintenance";

export type DeviceStatus = "available" | "rented" | "repair" | "retired";

export type GameStatus = "ready" | "playing" | "completed" | "cancelled";

export type PlayerType = "member" | "guest";

export type JoinPostStatus = "open" | "closed" | "cancelled";

export type ReportType = "game_result" | "tournament_result";
