import type { LucideIcon } from "lucide-react";
import { CheckCircle2 } from "lucide-react";

type ModulePageProps = {
  title: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
  tasks: string[];
  actions?: string[];
  kiosk?: boolean;
};

export function ModulePage({
  title,
  eyebrow,
  description,
  icon: Icon,
  tasks,
  actions = ["목록 조회", "신규 등록", "상태 변경"],
  kiosk = false
}: ModulePageProps) {
  return (
    <div className={`px-4 py-6 sm:px-6 lg:px-8 ${kiosk ? "text-xl" : ""}`}>
      <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[0.8fr_1.2fr] xl:items-start">
        <section className="rounded-md border border-[#dfe8dc] bg-white p-6 shadow-soft-line">
          <div className="grid size-14 place-items-center rounded-md bg-vista-leaf text-white">
            <Icon size={28} aria-hidden="true" />
          </div>
          <p className="mt-5 text-sm font-bold text-vista-leaf">{eyebrow}</p>
          <h1 className={`${kiosk ? "text-4xl" : "text-3xl"} mt-2 font-extrabold tracking-normal sm:text-4xl`}>
            {title}
          </h1>
          <p className="mt-4 max-w-xl leading-7 text-[#596556]">{description}</p>
        </section>

        <div className="grid gap-4">
          <section className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
            <h2 className="text-lg font-extrabold">1차 구현 항목</h2>
            <div className="mt-4 grid gap-3">
              {tasks.map((task) => (
                <div key={task} className="flex items-start gap-3 rounded-md bg-[#fbfcfa] p-3 ring-1 ring-[#e5ece1]">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-vista-leaf" size={20} aria-hidden="true" />
                  <span className="font-semibold leading-6">{task}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-[#dfe8dc] bg-white p-5 shadow-soft-line">
            <h2 className="text-lg font-extrabold">주요 작업 버튼</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {actions.map((action, index) => (
                <button
                  key={action}
                  type="button"
                  className={`rounded-md px-5 py-3 font-bold ${
                    index === 0 ? "bg-vista-leaf text-white" : "border border-[#cad8c6] bg-white"
                  } ${kiosk ? "min-h-16 min-w-40 text-2xl" : "text-sm"}`}
                >
                  {action}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
