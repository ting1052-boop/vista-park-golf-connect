export type HomeAssistantServiceResult = {
  ok: boolean;
  status: number;
  body: string;
};

type HomeAssistantServicePayload = Record<string, unknown>;

function getHomeAssistantConfig() {
  const baseUrl = process.env.HOME_ASSISTANT_URL?.replace(/\/$/, "");
  const token = process.env.HOME_ASSISTANT_TOKEN;

  if (!baseUrl || !token) {
    throw new Error("HOME_ASSISTANT_URL 또는 HOME_ASSISTANT_TOKEN 환경변수가 설정되지 않았습니다.");
  }

  return { baseUrl, token };
}

function getHomeAssistantTimeoutMs() {
  const value = Number(process.env.HOME_ASSISTANT_TIMEOUT_MS ?? 3500);
  return Number.isFinite(value) && value > 0 ? value : 3500;
}

async function readBody(response: Response) {
  try {
    return (await response.text()).slice(0, 2000);
  } catch {
    return "";
  }
}

export async function callHomeAssistantService(
  domain: string,
  service: string,
  payload: HomeAssistantServicePayload = {}
): Promise<HomeAssistantServiceResult> {
  const { baseUrl, token } = getHomeAssistantConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getHomeAssistantTimeoutMs());

  const response = await fetch(`${baseUrl}/api/services/${domain}/${service}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  return {
    ok: response.ok,
    status: response.status,
    body: await readBody(response)
  };
}

export async function runHomeAssistantScript(scriptEntityId: string, variables: HomeAssistantServicePayload = {}) {
  return callHomeAssistantService("script", "turn_on", {
    entity_id: scriptEntityId,
    variables
  });
}

export async function pingHomeAssistant() {
  const { baseUrl, token } = getHomeAssistantConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getHomeAssistantTimeoutMs());

  const response = await fetch(`${baseUrl}/api/`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store",
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  return {
    ok: response.ok,
    status: response.status,
    body: await readBody(response)
  };
}
