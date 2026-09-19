// HH 골프 PC 세팅 도구가 보내는 등록 요청의 해석과 검증.
// DB 를 건드리지 않아 `node --test src/lib/pc-registry-payload.test.ts` 로 그대로 돌릴 수 있다.

export type PcType = "range" | "park";
export type ActivationStatus = "licensed" | "unlicensed" | "unknown";

export type RegisterPayload = {
  deviceId: string;
  storeId: string | null;
  storeCode: string | null;
  bayId: string | null;
  bayCode: string | null;
  pcType: PcType;
  computerName: string;
  anydeskId: string;
  windowsEdition: string | null;
  windowsVersion: string | null;
  activationStatus: ActivationStatus;
  setupToolVersion: string | null;
  replace: boolean;
};

export type PayloadRejection = { code: "invalid_payload" | "forbidden_field"; field: string; message: string };
export type PayloadResult = { ok: true; payload: RegisterPayload } | { ok: false; error: PayloadRejection };

// 받지 않기로 한 값들. 조용히 버리면 세팅 도구가 계속 보낼 수 있으므로 거절해서 알린다.
const FORBIDDEN_FIELDS = [
  "password",
  "anydeskPassword",
  "unattendedPassword",
  "productKey",
  "windowsProductKey",
  "licenseKey"
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_ID = /^[0-9a-f]{32,128}$/;
// Windows 컴퓨터 이름: 영숫자로 시작, 하이픈 허용, 63자 이하.
const COMPUTER_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/;

const PC_TYPES: PcType[] = ["range", "park"];
const ACTIVATION_STATUSES: ActivationStatus[] = ["licensed", "unlicensed", "unknown"];

function reject(field: string, message: string, code: PayloadRejection["code"] = "invalid_payload"): PayloadResult {
  return { ok: false, error: { code, field, message } };
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

// AnyDesk 는 화면에 "123 456 789" 또는 "123456789@ad" 로 보여준다. 운영자가 보이는
// 대로 옮겨 적어도 통과해야 한다.
export function normalizeAnydeskId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/[\s-]/g, "").replace(/@.*$/, "");
  return /^[0-9]{6,12}$/.test(digits) ? digits : null;
}

export function parseRegisterPayload(body: unknown): PayloadResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return reject("body", "요청 본문이 객체가 아닙니다.");
  }

  const raw = body as Record<string, unknown>;

  for (const field of FORBIDDEN_FIELDS) {
    if (raw[field] !== undefined) {
      return reject(field, `${field} 은(는) 받지 않습니다. 요청에서 빼주세요.`, "forbidden_field");
    }
  }

  const deviceId = typeof raw.deviceId === "string" ? raw.deviceId.trim().toLowerCase() : "";
  if (!DEVICE_ID.test(deviceId)) {
    return reject("deviceId", "deviceId 는 32~128자리 소문자 16진수여야 합니다.");
  }

  const storeId = typeof raw.storeId === "string" && UUID.test(raw.storeId.trim()) ? raw.storeId.trim() : null;
  const storeCode = text(raw.storeCode, 64);
  if (!storeId && !storeCode) {
    return reject("storeId", "storeId 또는 storeCode 가 필요합니다.");
  }

  const bayId = typeof raw.bayId === "string" && UUID.test(raw.bayId.trim()) ? raw.bayId.trim() : null;
  const bayCode = text(raw.bayCode, 32);
  if (!bayId && !bayCode) {
    return reject("bayId", "bayId 또는 bayCode 가 필요합니다.");
  }

  const pcType = typeof raw.pcType === "string" ? (raw.pcType.trim() as PcType) : null;
  if (!pcType || !PC_TYPES.includes(pcType)) {
    return reject("pcType", "pcType 은 range 또는 park 이어야 합니다.");
  }

  const computerName = typeof raw.computerName === "string" ? raw.computerName.trim() : "";
  if (!COMPUTER_NAME.test(computerName)) {
    return reject("computerName", "computerName 은 영숫자로 시작하는 63자 이하 이름이어야 합니다.");
  }

  const anydeskId = normalizeAnydeskId(raw.anydeskId);
  if (!anydeskId) {
    return reject("anydeskId", "anydeskId 는 6~12자리 숫자여야 합니다.");
  }

  const activationRaw = typeof raw.activationStatus === "string" ? raw.activationStatus.trim() : "unknown";
  if (!ACTIVATION_STATUSES.includes(activationRaw as ActivationStatus)) {
    return reject("activationStatus", "activationStatus 는 licensed, unlicensed, unknown 중 하나여야 합니다.");
  }

  if (raw.replace !== undefined && typeof raw.replace !== "boolean") {
    return reject("replace", "replace 는 true 또는 false 여야 합니다.");
  }

  return {
    ok: true,
    payload: {
      deviceId,
      storeId,
      storeCode,
      bayId,
      bayCode,
      pcType,
      computerName,
      anydeskId,
      windowsEdition: text(raw.windowsEdition, 120),
      windowsVersion: text(raw.windowsVersion, 120),
      activationStatus: activationRaw as ActivationStatus,
      setupToolVersion: text(raw.setupToolVersion, 40),
      replace: raw.replace === true
    }
  };
}

// 서버 로그에는 이것만 남긴다. 토큰과 요청 본문 전체는 어디에도 기록하지 않는다.
export function redactForLog(payload: Pick<RegisterPayload, "deviceId"> | null) {
  return { deviceIdPrefix: payload ? `${payload.deviceId.slice(0, 8)}…` : "unknown" };
}
