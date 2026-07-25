import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.VISTA_VERIFY_PORT ?? 3100);
const baseUrl = `http://127.0.0.1:${port}`;
const skipBuild = process.argv.includes("--skip-build");
const npmCli = process.env.npm_execpath;
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const checks = [];

function run(label, command, args, cwd = root) {
  process.stdout.write(`\n[검사] ${label}\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} 실패 (종료 코드 ${result.status ?? "알 수 없음"})`);
  }
}

function runNpm(label, args, cwd = root) {
  if (!npmCli) {
    throw new Error("npm 실행 경로를 찾지 못했습니다. npm run verify로 실행해주세요.");
  }

  run(label, process.execPath, [npmCli, ...args], cwd);
}

async function waitForServer(server) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`검증 서버가 조기 종료되었습니다. 종료 코드: ${server.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/admin/login`);
      if (response.ok) return;
    } catch {
      // 서버가 포트를 열 때까지 재시도합니다.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("검증 서버가 30초 안에 시작되지 않았습니다.");
}

async function requestCheck({
  label,
  pathname,
  method = "GET",
  body,
  expectedStatus,
  expectedLocation,
  expectedText,
  expectedContentType
}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    redirect: "manual",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const responseText = await response.text();
  let failure = null;

  if (!expectedStatus.includes(response.status)) {
    failure = `상태 ${response.status}, 기대값 ${expectedStatus.join("/")}`;
  } else if (expectedLocation && !response.headers.get("location")?.includes(expectedLocation)) {
    failure = `이동 주소 ${response.headers.get("location") ?? "없음"}, 기대값 ${expectedLocation}`;
  } else if (expectedText && !responseText.includes(expectedText)) {
    failure = `본문에 "${expectedText}" 없음`;
  } else if (expectedContentType && !response.headers.get("content-type")?.includes(expectedContentType)) {
    failure = `Content-Type ${response.headers.get("content-type") ?? "없음"}, 기대값 ${expectedContentType}`;
  }

  checks.push({ label, ok: failure === null, detail: failure ?? `HTTP ${response.status}` });
}

async function stopServer(server) {
  if (server.exitCode !== null) return;

  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000))
  ]);

  if (server.exitCode === null) server.kill("SIGKILL");
}

let server;

try {
  runNpm("TypeScript", ["run", "typecheck"]);
  runNpm("ESLint", ["run", "lint"]);
  runNpm("Windows Agent JavaScript", ["run", "check"], path.join(root, "windows-agent"));

  if (!skipBuild) {
    runNpm("Next.js 프로덕션 빌드", ["run", "build"]);
  } else if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
    throw new Error("--skip-build를 사용하려면 먼저 npm run build를 실행해야 합니다.");
  }

  server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      KIOSK_ACCESS_KEY: "vista-verification-kiosk-key",
      CRON_SECRET: "vista-verification-cron-secret",
      IOT_WEBHOOK_SECRET: "vista-verification-iot-secret"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  await waitForServer(server);

  await requestCheck({
    label: "루트 관리자 이동",
    pathname: "/",
    expectedStatus: [307, 308],
    expectedLocation: "/admin/dashboard"
  });
  await requestCheck({
    label: "고객 예약 화면",
    pathname: "/member/app",
    expectedStatus: [200],
    expectedText: "회원 예약"
  });
  await requestCheck({
    label: "예약 단축 주소",
    pathname: "/reserve",
    expectedStatus: [200],
    expectedText: "회원 예약"
  });
  await requestCheck({
    label: "입구 키오스크 화면",
    pathname: "/kiosk/entrance?key=vista-verification-kiosk-key",
    expectedStatus: [200],
    expectedText: "오늘 이용을 시작할까요"
  });
  await requestCheck({
    label: "관리자 로그인 화면",
    pathname: "/admin/login",
    expectedStatus: [200],
    expectedText: "관리자 로그인"
  });
  await requestCheck({
    label: "미로그인 관리자 차단",
    pathname: "/admin/dashboard",
    expectedStatus: [307, 308],
    expectedLocation: "/admin/login"
  });
  await requestCheck({
    label: "PWA manifest",
    pathname: "/manifest.webmanifest",
    expectedStatus: [200],
    expectedContentType: "application/manifest+json"
  });
  await requestCheck({
    label: "PWA 192 아이콘",
    pathname: "/icons/icon-192.png",
    expectedStatus: [200],
    expectedContentType: "image/png"
  });
  await requestCheck({
    label: "PWA 512 아이콘",
    pathname: "/icons/icon-512.png",
    expectedStatus: [200],
    expectedContentType: "image/png"
  });
  await requestCheck({
    label: "키오스크 API 인증 차단",
    pathname: "/api/kiosk/bays",
    method: "POST",
    body: {},
    expectedStatus: [401]
  });
  await requestCheck({
    label: "관리자 입장 API 인증 차단",
    pathname: "/api/admin/session/start",
    method: "POST",
    body: {},
    expectedStatus: [401]
  });
  await requestCheck({
    label: "관리자 종료 API 인증 차단",
    pathname: "/api/admin/session/end",
    method: "POST",
    body: {},
    expectedStatus: [401]
  });
  await requestCheck({
    label: "자동 종료 API 인증 차단",
    pathname: "/api/cron/close-expired-sessions",
    expectedStatus: [401]
  });
  await requestCheck({
    label: "예약 준비 API 인증 차단",
    pathname: "/api/automation/reservation-prepare",
    method: "POST",
    body: {},
    expectedStatus: [401]
  });
  await requestCheck({
    label: "예약 조회 입력 검증",
    pathname: "/api/member/reservations",
    method: "POST",
    body: {},
    expectedStatus: [400]
  });

  const failed = checks.filter((check) => !check.ok);
  process.stdout.write("\n[HTTP 스모크 테스트]\n");
  for (const check of checks) {
    process.stdout.write(`${check.ok ? "PASS" : "FAIL"} ${check.label}: ${check.detail}\n`);
  }

  if (failed.length > 0) {
    throw new Error(`HTTP 스모크 테스트 ${failed.length}건 실패\n${serverOutput}`);
  }

  process.stdout.write(`\n전체 검증 통과: 정적 검사 4종 + HTTP ${checks.length}종\n`);
} catch (error) {
  process.stderr.write(`\n검증 실패: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  if (server) await stopServer(server);
}
