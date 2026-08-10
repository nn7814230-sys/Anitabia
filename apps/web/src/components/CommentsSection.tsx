import { useEffect, useState, type FormEvent } from "react";

import { apiUrl } from "../api";
import type { AccountUser, Achievement, Release, ReleaseComment } from "../types";

export function CommentsSection({
  release,
  user,
  onOpenAuth,
  onAchievements,
}: {
  release: Release;
  user: AccountUser | null;
  onOpenAuth: () => void;
  onAchievements: (items: Achievement[]) => void;
}) {
  const [comments, setComments] = useState<ReleaseComment[]>([]);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    fetch(`${apiUrl}/releases/${encodeURIComponent(release.slug)}/comments`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить комментарии.");
        return response.json() as Promise<{ data: ReleaseComment[] }>;
      })
      .then((payload) => setComments(payload.data))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить комментарии.");
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [release.slug, user?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    const normalized = content.trim();
    if (!normalized || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/releases/${encodeURIComponent(release.slug)}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: normalized }),
      });
      const payload = await response.json().catch(() => null) as {
        data?: { comment: ReleaseComment; newAchievements: Achievement[] };
        message?: string;
      } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.message ?? "Не удалось отправить комментарий.");
      setComments((current) => [payload.data!.comment, ...current]);
      setContent("");
      onAchievements(payload.data.newAchievements);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось отправить комментарий.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const remove = async (comment: ReleaseComment) => {
    const response = await fetch(`${apiUrl}/releases/${encodeURIComponent(release.slug)}/comments/${comment.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (response.ok) setComments((current) => current.filter((item) => item.id !== comment.id));
  };

  return (
    <section className="comments-section">
      <div className="comments-heading">
        <div><p className="section-kicker">Обсуждение</p><h2>Комментарии</h2></div>
        <span>{comments.length}</span>
      </div>
      <form className="comment-form" onSubmit={submit}>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onFocus={() => { if (!user) onOpenAuth(); }}
          placeholder={user ? "Поделитесь впечатлением о тайтле…" : "Войдите, чтобы оставить комментарий"}
          maxLength={2000}
          rows={4}
        />
        <div><small>{content.length}/2000 · Развёрнутым считается комментарий длиннее 100 символов</small><button className="watch-button" type="submit" disabled={!content.trim() || isSubmitting}>{isSubmitting ? "Отправляем…" : "Отправить"}</button></div>
      </form>
      {error ? <p className="comment-error">{error}</p> : null}
      <div className="comment-list">
        {comments.map((comment) => (
          <article className="comment-card" key={comment.id}>
            <header><strong>{comment.author.username}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></header>
            <p>{comment.content}</p>
            {comment.isOwn ? <button type="button" onClick={() => void remove(comment)}>Удалить</button> : null}
          </article>
        ))}
        {!isLoading && !comments.length ? <div className="profile-empty">Обсуждение пока пусто. Можно стать первым.</div> : null}
        {isLoading ? <p className="profile-loading">Загружаем комментарии…</p> : null}
      </div>
    </section>
  );
}
