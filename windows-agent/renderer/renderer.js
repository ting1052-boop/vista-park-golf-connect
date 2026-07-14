const appElement = document.getElementById("app");
const warningBay = document.getElementById("warningBay");
const warningRemaining = document.getElementById("warningRemaining");
const extensionMessage = document.getElementById("extensionMessage");
const extendButton = document.getElementById("extendButton");
const confirmButton = document.getElementById("confirmButton");
const extensionDialog = document.getElementById("extensionDialog");
const decreaseButton = document.getElementById("decreaseButton");
const increaseButton = document.getElementById("increaseButton");
const extensionMinutes = document.getElementById("extensionMinutes");
const cancelExtensionButton = document.getElementById("cancelExtensionButton");
const confirmExtensionButton = document.getElementById("confirmExtensionButton");
const lockBay = document.getElementById("lockBay");
const lockEndsAt = document.getElementById("lockEndsAt");

let latestState = null;
let localTimer = null;
let selectedExtensionMinutes = 30;

function formatRemaining(seconds) {
  if (seconds === null || seconds === undefined) return "--:--";
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

function getRemainingFromState(state) {
  if (!state?.session?.endsAt) return null;
  return Math.max(0, Math.floor((new Date(state.session.endsAt).getTime() - Date.now()) / 1000));
}

function setShellMode(mode) {
  appElement.className = `agent-shell ${mode}-shell`;
}

function setExtensionDialog(open) {
  extensionDialog.hidden = !open;
}

function renderExtensionMinutes() {
  extensionMinutes.textContent = `${selectedExtensionMinutes}분`;
  decreaseButton.disabled = selectedExtensionMinutes <= 30;
}

function render(state) {
  latestState = state;

  const session = state.session;
  const remainingSeconds = getRemainingFromState(state);
  const remainingText = formatRemaining(remainingSeconds);
  const bayCode = state.agent?.bayCode ?? "타석";

  setShellMode(state.mode);

  warningBay.textContent = bayCode;
  warningRemaining.textContent = remainingText;
  extensionMessage.textContent = state.extensionRequest?.message ?? "";

  lockBay.textContent = bayCode;
  lockEndsAt.textContent = `종료 예정 ${formatClock(session?.endsAt)}`;

  const isPending = state.extensionRequest?.status === "pending";
  extendButton.disabled = isPending;
  confirmExtensionButton.disabled = isPending;
  confirmExtensionButton.textContent = isPending ? "처리 중" : "연장";

  if (!extensionDialog.hidden && state.mode === "lock") {
    setExtensionDialog(false);
  }
}

function startLocalTimer() {
  if (localTimer) window.clearInterval(localTimer);
  localTimer = window.setInterval(() => {
    if (latestState) render(latestState);
  }, 1000);
}

extendButton.addEventListener("click", () => {
  selectedExtensionMinutes = latestState?.policy?.extensionMinutes ?? 30;
  renderExtensionMinutes();
  setExtensionDialog(true);
});

increaseButton.addEventListener("click", () => {
  selectedExtensionMinutes += 30;
  renderExtensionMinutes();
});

decreaseButton.addEventListener("click", () => {
  selectedExtensionMinutes = Math.max(30, selectedExtensionMinutes - 30);
  renderExtensionMinutes();
});

cancelExtensionButton.addEventListener("click", () => {
  setExtensionDialog(false);
});

confirmExtensionButton.addEventListener("click", async () => {
  confirmExtensionButton.disabled = true;
  extensionMessage.textContent = "연장 요청을 처리하고 있습니다.";
  const result = await window.vistaAgent.requestExtension(selectedExtensionMinutes);
  extensionMessage.textContent = result?.message ?? `${selectedExtensionMinutes}분 연장되었습니다.`;
  confirmExtensionButton.disabled = false;
  setExtensionDialog(false);
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

renderExtensionMinutes();
startLocalTimer();
