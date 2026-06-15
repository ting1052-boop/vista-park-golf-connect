"use client";

import { useState } from "react";
import { Loader2, Play, ShieldCheck } from "lucide-react";

const TESTS = [
  { label: "공용 ON (조명·AC)", script: "script.shared_on" },
  { label: "공용 OFF", script: "script.shared_off" },
  { label: "1번타석 ON", script: "script.bay1_on" },
  { label: "1번타석 OFF", script: "script.bay1_off" },
  { label: "2번타석 ON", script: "script.bay2_on" },
  { label: "2번타석 OFF", script: "script.bay2_off" },
  { label: "3번타석 ON", script: "script.bay3_on" },
  { label: "3번타석 OFF", script: "script.bay3_off" }
];

type AutomationTestResponse = {
  ok?: boolean;
  message?: string;
  body?: string;
};

export function DeviceTestButtons() {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function run(script: string, label: string) {
    setBusy(script);
    setMessage("");

    try {
      const response = await fetch("/api/automation/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-iot-webhook-secret": secret
        },
        body: JSON.stringify({ script })
      });
      const data = (await response.json()) as AutomationTestResponse;

      setMessage(data.ok ? `${label} 성공` : `${label} 실패: ${data.message ?? data.body ?? "오류"}`);
    } catch (error) {
      setMessage(`${label} 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-6 rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold text-vista-leaf">실기기 테스트</p>
          <h2 className="mt-1 text-xl font-extrabold">시흥점 Home Assistant 스크립트 직접 호출</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#697468]">
            실제 세션 연결 전, Home Assistant에 등록된 스크립트가 장비를 켜고 끄는지 먼저 확인합니다.
            자동문은 테스트 버튼에 포함하지 않았습니다.
          </p>
        </div>
        <label className="grid gap-1 text-sm font-bold text-[#4f5b50] lg:min-w-[300px]">
          테스트 비밀번호
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            className="rounded-md border border-[#cad8c6] bg-[#fbfcfa] px-3 py-3 font-semibold outline-none focus:border-vista-leaf"
            placeholder="IOT_WEBHOOK_SECRET"
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {TESTS.map((test) => (
          <button
            key={test.script}
            type="button"
            disabled={busy !== null || secret.trim().length === 0}
            onClick={() => run(test.script, test.label)}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[#cad8c6] bg-white px-3 py-3 text-sm font-extrabold transition hover:border-vista-leaf hover:bg-vista-fairway disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === test.script ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {test.label}
          </button>
        ))}
      </div>

      {message ? (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-[#fbfcfa] px-3 py-3 text-sm font-bold text-[#4f5b50] ring-1 ring-[#e5ece1]">
          <ShieldCheck className="mt-0.5 shrink-0 text-vista-leaf" size={18} aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}
    </section>
  );
}
