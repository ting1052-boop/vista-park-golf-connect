export type AutomationSchedule = {
  id: string;
  name: string;
  bayIds: string[] | null;
  closeBayIds?: string[] | null;
  enabled: boolean;
  openTime: string | null;
  closeTime: string | null;
  lastOpenedOn: string | null;
  lastClosedOn: string | null;
};

export type AutomationScheduleConfig = {
  mode: "store" | "zones";
  schedules: AutomationSchedule[];
};

export function validateScheduleConfig(value: unknown, validBayIds: Set<string>): AutomationScheduleConfig {
  if (!value || typeof value !== "object") throw new Error("운영시간 설정을 확인해주세요.");
  const input = value as Record<string, unknown>;
  if (input.mode !== "store" && input.mode !== "zones") throw new Error("운영 방식을 선택해주세요.");
  if (!Array.isArray(input.schedules) || input.schedules.length < 1 || input.schedules.length > 20 ||
    (input.mode === "store" && input.schedules.length !== 1)) throw new Error("운영시간 구역 수를 확인해주세요.");
  const assigned = new Set<string>();
  const ids = new Set<string>();
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  const schedules = input.schedules.map((value): AutomationSchedule => {
    if (!value || typeof value !== "object") throw new Error("구역 설정을 확인해주세요.");
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(row.id) || ids.has(row.id)) throw new Error("구역 식별자가 잘못되었습니다.");
    ids.add(row.id);
    if (typeof row.name !== "string" || !row.name.trim() || row.name.trim().length > 40) throw new Error("구역 이름은 1~40자로 입력해주세요.");
    if (typeof row.enabled !== "boolean" || typeof row.openTime !== "string" || typeof row.closeTime !== "string" ||
      !clock.test(row.openTime) || !clock.test(row.closeTime) || row.openTime >= row.closeTime) throw new Error("종료 시간은 시작 시간보다 늦어야 합니다.");
    let bayIds: string[] | null = null;
    let closeBayIds: string[] | null = null;
    if (input.mode === "zones") {
      if (!Array.isArray(row.bayIds) || row.bayIds.length === 0) throw new Error("각 구역에 타석을 선택해주세요.");
      bayIds = row.bayIds.map((id) => {
        if (typeof id !== "string" || !validBayIds.has(id)) throw new Error("다른 매장 또는 삭제된 타석은 선택할 수 없습니다.");
        if (assigned.has(id)) throw new Error("같은 타석을 여러 구역에 중복 배정할 수 없습니다.");
        assigned.add(id);
        return id;
      });
      closeBayIds = Array.isArray(row.closeBayIds) ? row.closeBayIds.map((id) => {
        if (typeof id !== "string" || !validBayIds.has(id)) throw new Error("종료 대상 타석을 확인해주세요.");
        return id;
      }) : bayIds;
    }
    return {
      id: row.id,
      name: row.name.trim(),
      bayIds,
      closeBayIds,
      enabled: row.enabled,
      openTime: row.openTime,
      closeTime: row.closeTime,
      lastOpenedOn: typeof row.lastOpenedOn === "string" ? row.lastOpenedOn : null,
      lastClosedOn: typeof row.lastClosedOn === "string" ? row.lastClosedOn : null
    };
  });
  return { mode: input.mode, schedules };
}
