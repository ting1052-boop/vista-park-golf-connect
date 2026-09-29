import { createHash, timingSafeEqual } from "crypto";

// 매장 제어기 인증.
//
// 전역 토큰(STORE_CONTROLLER_TOKEN): 시흥이 쓰는 기존 방식. 어느 매장이든 x-store-id 로 고른다.
// 매장 토큰(store_controller_tokens): 매장마다 발급한다. 토큰이 어느 매장 것인지 서버가 정하고
//   x-store-id 는 무시한다. 그래서 한 매장의 토큰이 유출돼도 다른 매장 명령을 가져갈 수 없다.
//   DB 에는 해시만 저장한다.

export type ControllerAuth = { ok: true; storeId: string; scoped: boolean } | { ok: false };

export function hashControllerToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// 길이가 다르면 timingSafeEqual 이 던지므로 길이부터 비교한다.
function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function readBearerToken(authorization: string | null | undefined) {
  return authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function resolveControllerAuth(args: {
  received: string;
  globalToken: string | undefined;
  headerStoreId: string;
  // 매장 토큰 해시로 매장을 찾는다. 테이블이 없거나 조회가 실패하면 null(거부).
  lookupStoreByTokenHash: (hash: string) => Promise<string | null>;
}): Promise<ControllerAuth> {
  if (!args.received) return { ok: false };

  if (args.globalToken && safeEqual(args.globalToken, args.received)) {
    return { ok: true, storeId: args.headerStoreId, scoped: false };
  }

  const storeId = await args.lookupStoreByTokenHash(hashControllerToken(args.received));
  return storeId ? { ok: true, storeId, scoped: true } : { ok: false };
}
