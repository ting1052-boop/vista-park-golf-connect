import { Wallet } from "lucide-react";
import { getUnpaidWalkins } from "@/lib/supabase/dashboard";

const CURRENT_STORE_ID = "11111111-1111-4111-8111-111111111111";

function formatCurrency(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export default async function UnpaidPage() {
  const result = await getUnpaidWalkins(CURRENT_STORE_ID).catch((error) => ({
    error: error instanceof Error ? error.message : "미수금 내역을 불러오지 못했습니다.",
    rows: [],
    totalAmount: 0
  }));

  const errorMessage = "error" in result ? result.error : null;
  const { rows, totalAmount } = result;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-md bg-vista-leaf text-white">
                <Wallet size={28} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-vista-leaf">후불 · 계좌이체 정산</p>
                <h1 className="mt-1 text-3xl font-extrabold">오늘 미수금</h1>
                <p className="mt-2 text-sm leading-6 text-[#697468]">
                  오늘 현장 이용(후불) 접수 내역입니다. 마감 시 입금 여부를 확인하세요.
                </p>
              </div>
            </div>
            <div className="rounded-md bg-vista-fairway px-5 py-4 text-right">
              <p className="text-xs font-bold text-[#4f5b50]">미수금 합계</p>
              <p className="mt-1 text-2xl font-extrabold text-vista-leaf">{formatCurrency(totalAmount)}</p>
              <p className="mt-1 text-xs font-semibold text-[#697468]">{rows.length}건</p>
            </div>
          </div>

          {errorMessage ? (
            <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
              {errorMessage}
            </p>
          ) : rows.length === 0 ? (
            <p className="mt-6 rounded-md border border-[#e5ece1] bg-[#fbfcfa] px-4 py-6 text-center text-sm font-bold text-[#697468]">
              오늘 후불 접수 내역이 없습니다.
            </p>
          ) : (
            <div className="mt-6 overflow-hidden rounded-md border border-[#e5ece1]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f3f7f1] text-[#4f5b50]">
                  <tr>
                    <th className="px-4 py-3 font-bold">시간</th>
                    <th className="px-4 py-3 font-bold">타석</th>
                    <th className="px-4 py-3 font-bold">인원</th>
                    <th className="px-4 py-3 text-right font-bold">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-[#e5ece1]">
                      <td className="px-4 py-3 font-extrabold">{row.time}</td>
                      <td className="px-4 py-3 font-semibold">{row.bay}</td>
                      <td className="px-4 py-3 font-semibold">{row.partySize}명</td>
                      <td className="px-4 py-3 text-right font-extrabold text-vista-leaf">
                        {formatCurrency(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs font-semibold leading-5 text-[#9aa39a]">
            현재는 후불 접수 내역만 표시합니다. 개별 입금 확인(정산 완료) 처리는 다음 단계에서 추가됩니다.
          </p>
        </section>
      </div>
    </div>
  );
}
