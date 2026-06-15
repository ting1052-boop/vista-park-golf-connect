import { Lightbulb, Power, ShieldAlert, Snowflake, Timer, Zap } from "lucide-react";
import { DeviceTestButtons } from "@/components/device-test-buttons";
import {
  accessSessionRows,
  automationDeviceRows,
  automationLogRows,
  entryCheckRows,
  showroomAutomationScenarios
} from "@/lib/dashboard-data";

const sceneButtons = [
  { label: "예약 입장 준비", description: "로비 조명, 냉난방, 타석 조명, 키오스크 전원 ON", icon: Lightbulb },
  { label: "타석 이용 시작", description: "타석 장비 전원 ON, 키오스크 이용시간 시작", icon: Zap },
  { label: "이용 종료 정리", description: "키오스크 잠금, 타석 조명과 냉난방 OFF", icon: Power },
  { label: "마감 전체 OFF", description: "전체 조명, 냉난방, 타석 장비 전원 OFF", icon: ShieldAlert }
];

export default function AutomationPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-vista-leaf">무인 매장 자동제어</p>
              <h1 className="mt-1 text-3xl font-extrabold">조명 · 냉난방 · 키오스크 · 타석 전원 제어</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#697468]">
                1차 MVP에서는 출입문 제어를 제외하고, 헤이홈/Tapo 계열 장비를 통해 매장 준비와 이용 종료 정리를
                자동화하는 흐름에 집중합니다.
              </p>
            </div>
            <div className="rounded-md border border-[#edd9c4] bg-[#fff9f0] px-4 py-3 text-sm font-bold text-[#8a5a21]">
              실제 장비 제어 전 수동 차단과 실패 알림 정책을 먼저 확인합니다.
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {sceneButtons.map((scene) => {
            const Icon = scene.icon;
            return (
              <button
                key={scene.label}
                type="button"
                className="rounded-md border border-[#dfe8dc] bg-white p-5 text-left shadow-soft-line transition hover:border-vista-leaf hover:bg-vista-fairway"
              >
                <span className="grid size-12 place-items-center rounded-md bg-vista-leaf text-white">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-lg font-extrabold">{scene.label}</h2>
                <p className="mt-2 text-sm leading-6 text-[#697468]">{scene.description}</p>
              </button>
            );
          })}
        </section>

        <section className="mt-6 rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold text-vista-leaf">비스타파크골프 시흥점 쇼룸 실증</p>
              <h2 className="mt-1 text-xl font-extrabold">헤이홈 · Tapo 장비 자동화 테스트 흐름</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#697468]">
                현재 원격으로 켜고 있는 쇼룸 장비를 기준으로 예약 준비, 이용 시작, 종료 정리 흐름을 먼저 검증합니다.
                프로젝터는 헤이홈, PC 전원은 Tapo 플러그 중심으로 연결합니다.
              </p>
            </div>
            <span className="rounded-md bg-[#edf6ef] px-3 py-2 text-sm font-extrabold text-vista-leaf">
              출입문 자동제어는 1차 제외
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            {showroomAutomationScenarios.map((scenario) => (
              <article key={scenario.name} className="rounded-md border border-[#e5ece1] bg-[#fbfcfa] p-4">
                <p className="text-sm font-extrabold text-vista-leaf">{scenario.trigger}</p>
                <h3 className="mt-2 font-extrabold">{scenario.name}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#697468]">{scenario.steps}</p>
              </article>
            ))}
          </div>
        </section>

        <DeviceTestButtons />

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <article className="rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
            <div className="border-b border-[#e5ece1] p-5">
              <h2 className="text-lg font-extrabold">입장 인증</h2>
              <p className="mt-1 text-sm text-[#697468]">
                문을 제어하지 않고, 고객 인증 후 키오스크 이용시간과 장비 자동화를 실행합니다.
              </p>
            </div>
            <div className="divide-y divide-[#edf2ea]">
              {entryCheckRows.map((row) => (
                <div key={row.name} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-extrabold">{row.name}</p>
                      <p className="mt-1 text-sm font-semibold text-[#697468]">{row.method}</p>
                    </div>
                    <span className="rounded-md bg-[#edf6ef] px-3 py-1 text-sm font-bold text-vista-leaf">{row.state}</span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-[#697468]">{row.next}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 border-t border-[#edf2ea] p-4">
              <button type="button" className="rounded-md bg-vista-leaf px-3 py-3 text-sm font-extrabold text-white">
                승인
              </button>
              <button type="button" className="rounded-md border border-[#cad8c6] bg-white px-3 py-3 text-sm font-extrabold">
                연장
              </button>
              <button type="button" className="rounded-md border border-[#e7c7c7] bg-[#fff8f8] px-3 py-3 text-sm font-extrabold text-[#a14a4a]">
                종료
              </button>
            </div>
          </article>

          <article className="rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
            <div className="border-b border-[#e5ece1] p-5">
              <h2 className="text-lg font-extrabold">입장 · 키오스크 세션</h2>
              <p className="mt-1 text-sm text-[#697468]">
                인원수 또는 업주 지정 시간에 따라 키오스크 이용 시간을 부여합니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-vista-fairway text-[#566153]">
                  <tr>
                    <th className="px-5 py-3 font-bold">입장</th>
                    <th className="px-5 py-3 font-bold">고객</th>
                    <th className="px-5 py-3 font-bold">타석</th>
                    <th className="px-5 py-3 font-bold">인원</th>
                    <th className="px-5 py-3 font-bold">잔여 시간</th>
                    <th className="px-5 py-3 font-bold">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2ea]">
                  {accessSessionRows.map((row) => (
                    <tr key={`${row.time}-${row.member}`} className="hover:bg-[#fbfcfa]">
                      <td className="px-5 py-4 font-extrabold">{row.time}</td>
                      <td className="px-5 py-4">{row.member}</td>
                      <td className="px-5 py-4 font-bold">{row.bay}</td>
                      <td className="px-5 py-4">{row.people}</td>
                      <td className="px-5 py-4 font-bold text-vista-leaf">{row.remaining}</td>
                      <td className="px-5 py-4">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-md border border-[#dfe8dc] bg-white shadow-soft-line">
            <div className="border-b border-[#e5ece1] p-5">
              <h2 className="text-lg font-extrabold">장비별 제어 상태</h2>
              <p className="mt-1 text-sm text-[#697468]">
                장비 공급사는 예시이며, 실제 연동 전 테스트용 매장 장비 ID를 등록해야 합니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-vista-fairway text-[#566153]">
                  <tr>
                    <th className="px-5 py-3 font-bold">구역</th>
                    <th className="px-5 py-3 font-bold">장비</th>
                    <th className="px-5 py-3 font-bold">연동</th>
                    <th className="px-5 py-3 font-bold">상태</th>
                    <th className="px-5 py-3 font-bold">다음 동작</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2ea]">
                  {automationDeviceRows.map((row) => (
                    <tr key={`${row.zone}-${row.device}`} className="hover:bg-[#fbfcfa]">
                      <td className="px-5 py-4 font-extrabold">{row.zone}</td>
                      <td className="px-5 py-4">{row.device}</td>
                      <td className="px-5 py-4">{row.type}</td>
                      <td className="px-5 py-4 font-bold text-vista-leaf">{row.state}</td>
                      <td className="px-5 py-4 text-[#697468]">{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
            <h2 className="text-lg font-extrabold">최근 제어 로그</h2>
            <div className="mt-4 grid gap-3">
              {automationLogRows.map((row) => (
                <div key={`${row.time}-${row.target}`} className="rounded-md bg-[#fbfcfa] p-3 ring-1 ring-[#e5ece1]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-extrabold">{row.time}</p>
                    <span className="text-xs font-bold text-vista-leaf">{row.result}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold">{row.target}</p>
                  <p className="mt-1 text-xs font-semibold text-[#697468]">{row.event}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-6 rounded-md border border-[#edd9c4] bg-[#fff9f0] p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 shrink-0 text-[#a15f1d]" size={22} aria-hidden="true" />
            <div>
              <h2 className="font-extrabold text-[#704514]">출입문 제어는 2차 검토</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#7a5b35]">
                자동문 ON/OFF는 안전, 비상탈출, 현장 책임 문제가 있으므로 1차에서는 제외합니다.
                현재 MVP는 입장 인증과 매장 장비 자동화에 집중합니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-4">
          <div className="rounded-md border border-[#dfe8dc] bg-white p-4 text-center shadow-soft-line">
            <Lightbulb className="mx-auto text-vista-leaf" size={24} aria-hidden="true" />
            <p className="mt-2 text-sm font-extrabold">조명</p>
          </div>
          <div className="rounded-md border border-[#dfe8dc] bg-white p-4 text-center shadow-soft-line">
            <Snowflake className="mx-auto text-vista-leaf" size={24} aria-hidden="true" />
            <p className="mt-2 text-sm font-extrabold">냉난방</p>
          </div>
          <div className="rounded-md border border-[#dfe8dc] bg-white p-4 text-center shadow-soft-line">
            <Timer className="mx-auto text-vista-leaf" size={24} aria-hidden="true" />
            <p className="mt-2 text-sm font-extrabold">이용시간</p>
          </div>
          <div className="rounded-md border border-[#dfe8dc] bg-white p-4 text-center shadow-soft-line">
            <Power className="mx-auto text-vista-leaf" size={24} aria-hidden="true" />
            <p className="mt-2 text-sm font-extrabold">전원</p>
          </div>
        </section>
      </div>
    </div>
  );
}
