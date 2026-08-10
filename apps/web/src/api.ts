import type { Achievement } from "./types";

export const apiUrl = import.meta.env.VITE_API_URL ?? "/api/v1";

export async function completeEpisode(releaseSlug: string, episodeNumber: number): Promise<Achievement[]> {
  const response = await fetch(`${apiUrl}/video/complete`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ releaseSlug, episodeNumber }),
  });
  const payload = await response.json().catch(() => null) as {
    data?: { newAchievements?: Achievement[] };
    message?: string;
  } | null;
  if (!response.ok) throw new Error(payload?.message ?? "Не удалось сохранить просмотр серии.");
  return payload?.data?.newAchievements ?? [];
}

export function websocketApiUrl(path: string): string {
  const base = new URL(apiUrl, window.location.origin);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `${base.pathname.replace(/\/$/u, "")}/${path.replace(/^\//u, "")}`;
  base.search = "";
  return base.toString();
}
