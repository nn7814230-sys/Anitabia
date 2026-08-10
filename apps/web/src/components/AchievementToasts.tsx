import type { Achievement } from "../types";

export type AchievementToast = Achievement & { notificationId: string };

export function AchievementToasts({ items, onDismiss }: { items: AchievementToast[]; onDismiss: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <aside className="achievement-toasts" aria-live="polite" aria-label="Новые достижения">
      {items.map((item) => (
        <button className="achievement-toast" type="button" key={item.notificationId} onClick={() => onDismiss(item.notificationId)}>
          <img src={item.iconUrl} alt="" />
          <span><small>Достижение открыто</small><strong>{item.title}</strong><em>{item.description}</em></span>
          <b aria-hidden="true">×</b>
        </button>
      ))}
    </aside>
  );
}
