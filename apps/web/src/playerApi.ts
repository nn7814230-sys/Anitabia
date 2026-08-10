export type KodikPlayerEvent = {
  name: string;
  value: unknown;
};

export function readKodikPlayerEvent(event: MessageEvent, iframe: HTMLIFrameElement | null): KodikPlayerEvent | null {
  if (!iframe?.contentWindow || event.source !== iframe.contentWindow) return null;
  const data = event.data as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.key !== "string" || !record.key.startsWith("kodik_player_")) return null;
  return { name: record.key, value: record.value };
}

export function numericPlayerValue(value: unknown, ...keys: string[]): number | null {
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const number = Number(record[key]);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function sendKodikCommand(
  iframe: HTMLIFrameElement | null,
  method: "play" | "pause" | "seek" | "get_time",
  options: Record<string, unknown> = {},
): void {
  iframe?.contentWindow?.postMessage({ key: "kodik_player_api", value: { method, ...options } }, "*");
}
