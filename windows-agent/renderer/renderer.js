const appElement = document.getElementById("app");
const miniBay = document.getElementById("miniBay");
const miniTime = document.getElementById("miniTime");
const miniLabel = document.getElementById("miniLabel");
const warningTitle = document.getElementById("warningTitle");
const warningBody = document.getElementById("warningBody");
const warningBay = document.getElementById("warningBay");
const warningRemaining = document.getElementById("warningRemaining");
const warningEndsAt = document.getElementById("warningEndsAt");
const warningPrice = document.getElementById("warningPrice");
const extensionMessage = document.getElementById("extensionMessage");
const extendButton = document.getElementById("extendButton");
const confirmButton = document.getElementById("confirmButton");
const lockBay = document.getElementById("lockBay");
const lockEndsAt = document.getElementById("lockEndsAt");

let latestState = null;
let localTimer = null;

function formatRemaining(seconds) {
  if (seconds === null || seconds === undefined) return "대기";
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function formatClock(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(value);
}

function getRemainingFromState(state) {
  if (!state?.session?.endsAt) return null;
  return Math.max(0, Math.floor((new Date(state.session.endsAt).getTime() - Date.now()) / 1000));
}

function setShellMode(mode, isCritical) {
  appElement.className = `agent-shell ${mode}-shell${isCritical ? " critical" : ""}`;
}

function render(state) {
  latestState = state;

  const session = state.session;
  const remainingSeconds = getRemainingFromState(state);
  const remainingText = formatRemaining(remainingSeconds);
  const bayCode = state.agent?.bayCode ?? "타석";
  const isCritical = Boolean(
    session && remainingSeconds !== null && remainingSeconds <= state.policy.criticalBeforeMinutes * 60
  );

  setShellMode(state.mode, isCritical);

  miniBay.textContent = bayCode;
  miniTime.textContent = remainingText;
  miniLabel.textContent = session ? "남은 시간" : "세션 대기";

  warningTitle.textContent = isCritical ? "곧 이용이 종료됩니다" : "이용 종료 10분 전입니다";
  warningBody.textContent = `${bayCode} 이용 시간이 얼마 남지 않았습니다. 계속 이용하시려면 연장을 눌러주세요.`;
  warningBay.textContent = bayCode;
  warningRemaining.textContent = remainingText;
  warningEndsAt.textContent = formatClock(session?.endsAt);
  warningPrice.textContent = `${state.policy.extensionMinutes}분 ${formatCurrency(state.policy.extensionPrice)}`;
  extensionMessage.textContent = state.extensionRequest?.message ?? "";

  lockBay.textContent = bayCode;
  lockEndsAt.textContent = `종료 예정 ${formatClock(session?.endsAt)}`;

  extendButton.disabled = state.extensionRequest?.status === "pending";
  extendButton.textContent = state.extensionRequest?.status === "pending" ? "요청 중" : "연장";
}

function startLocalTimer() {
  if (localTimer) window.clearInterval(localTimer);
  localTimer = window.setInterval(() => {
    if (latestState) render(latestState);
  }, 1000);
}

extendButton.addEventListener("click", async () => {
  extendButton.disabled = true;
  extensionMessage.textContent = "연장 요청을 처리하고 있습니다.";
  const result = await window.vistaAgent.requestExtension();
  extensionMessage.textContent = result?.message ?? "연장 요청을 보냈습니다.";
  extendButton.disabled = false;
});

confirmButton.addEventListener("click", async () => {
  await window.vistaAgent.confirmWarning();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    void window.vistaAgent.closeAgent();
  }
});

window.vistaAgent.onState((state) => {
  render(state);
});

startLocalTimer();
