import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { apiUrl, completeEpisode, websocketApiUrl } from "../api";
import { numericPlayerValue, readKodikPlayerEvent, sendKodikCommand } from "../playerApi";
import type { AccountUser, Achievement, Episode, Release, RoomChatMessage, WatchRoomData } from "../types";
import { useRoomVoice, type RoomVoiceSignal } from "../hooks/useRoomVoice";
import { Header } from "./Header";
import { RemoteRoomAudio } from "./RemoteRoomAudio";

type ConnectionState = "connecting" | "connected" | "disconnected";

type PlayerMessage = {
  type: "player";
  action: "play" | "pause" | "seek" | "episode" | "sync";
  episodeNumber: number;
  position: number;
  playing: boolean;
  updatedAt: number;
};

export function RoomPage({
  code,
  user,
  onNavigateHome,
  onProfile,
  onLogout,
  onAchievements,
}: {
  code: string;
  user: AccountUser;
  onNavigateHome: () => void;
  onProfile: () => void;
  onLogout: () => void;
  onAchievements: (items: Achievement[]) => void;
}) {
  const [room, setRoom] = useState<WatchRoomData | null>(null);
  const [release, setRelease] = useState<Release | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [chatText, setChatText] = useState("");
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentTimeRef = useRef(0);
  const currentEpisodeRef = useRef(1);
  const localPlayingRef = useRef(false);
  const isHostRef = useRef(false);
  const canControlRef = useRef(false);
  const hasSnapshotRef = useRef(false);
  const completedRef = useRef(new Set<string>());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const voiceSignalHandlerRef = useRef<((message: RoomVoiceSignal) => void) | null>(null);

  const isHost = room?.host.id === user.id;
  const isCoHost = room?.coHostId === user.id;
  const canControl = isHost || isCoHost;
  isHostRef.current = isHost;
  canControlRef.current = canControl;

  const sendRoomMessage = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const voice = useRoomVoice({
    code,
    userId: user.id,
    participants: room?.participants ?? [],
    connectionState,
    sendMessage: sendRoomMessage,
    signalHandlerRef: voiceSignalHandlerRef,
  });

  const applyPlayback = useCallback((playback: WatchRoomData["playback"]) => {
    currentTimeRef.current = playback.position;
    currentEpisodeRef.current = playback.episodeNumber;
    localPlayingRef.current = playback.playing;
    if (iframeRef.current) {
      sendKodikCommand(iframeRef.current, "seek", { seconds: playback.position });
      window.setTimeout(() => sendKodikCommand(iframeRef.current, playback.playing ? "play" : "pause"), 120);
    }
    if (videoRef.current) {
      videoRef.current.currentTime = playback.position;
      if (playback.playing) void videoRef.current.play().catch(() => undefined);
      else videoRef.current.pause();
    }
  }, []);

  const completeCurrentEpisode = useCallback(() => {
    if (!release) return;
    const episodeNumber = currentEpisodeRef.current;
    const key = `${release.slug}:${episodeNumber}`;
    if (completedRef.current.has(key)) return;
    completedRef.current.add(key);
    void completeEpisode(release.slug, episodeNumber)
      .then(onAchievements)
      .catch(() => completedRef.current.delete(key));
  }, [onAchievements, release]);

  const sendPlayer = useCallback((action: PlayerMessage["action"], position = currentTimeRef.current, episodeNumber = currentEpisodeRef.current) => {
    if (!canControlRef.current) return;
    sendRoomMessage({ type: "player", action, position, episodeNumber });
  }, [sendRoomMessage]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch(`${apiUrl}/rooms/${encodeURIComponent(code)}`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { data?: WatchRoomData; message?: string } | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.message ?? "Не удалось открыть комнату.");
        return payload.data;
      })
      .then(async (roomData) => {
        setRoom(roomData);
        currentEpisodeRef.current = roomData.playback.episodeNumber;
        const response = await fetch(`${apiUrl}/releases/${encodeURIComponent(roomData.release.slug)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Релиз комнаты недоступен.");
        const payload = await response.json() as { data: { release: Release; episodes: Episode[] } };
        setRelease(payload.data.release);
        setEpisodes(payload.data.episodes);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Не удалось открыть комнату.");
      });
    return () => controller.abort();
  }, [code]);

  useEffect(() => {
    hasSnapshotRef.current = false;
    currentTimeRef.current = 0;
    localPlayingRef.current = false;
    let active = true;
    let reconnectTimer = 0;
    let heartbeatTimer = 0;
    let reconnectAttempt = 0;

    const stopHeartbeat = () => {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = 0;
    };

    const connect = () => {
      if (!active) return;
      setConnectionState("connecting");
      const socket = new WebSocket(websocketApiUrl(`/rooms/${encodeURIComponent(code)}/socket`));
      socketRef.current = socket;
      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
        setConnectionState("connected");
        stopHeartbeat();
        heartbeatTimer = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "heartbeat", clientTime: Date.now() }));
          }
        }, 20_000);
      });
      socket.addEventListener("message", (event) => {
        let message: Record<string, unknown>;
        try {
          const parsed = JSON.parse(String(event.data)) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
          message = parsed as Record<string, unknown>;
        } catch {
          return;
        }
        if (message.type === "heartbeat") return;
        if (message.type === "snapshot" && message.data && typeof message.data === "object") {
          const snapshot = message.data as WatchRoomData;
          setRoom(snapshot);
          const hostIsReconnecting = snapshot.host.id === user.id && hasSnapshotRef.current;
          if (hostIsReconnecting && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: "player",
              action: "sync",
              position: currentTimeRef.current,
              episodeNumber: currentEpisodeRef.current,
              playing: localPlayingRef.current,
            }));
          } else {
            applyPlayback(snapshot.playback);
          }
          hasSnapshotRef.current = true;
          return;
        }
        if (message.type === "presence" && Array.isArray(message.participants)) {
          setRoom((current) => current ? { ...current, participants: message.participants as WatchRoomData["participants"] } : current);
          return;
        }
        if (message.type === "controller" && (typeof message.coHostId === "string" || message.coHostId === null)) {
          setRoom((current) => current ? {
            ...current,
            coHostId: message.coHostId as string | null,
            participants: Array.isArray(message.participants)
              ? message.participants as WatchRoomData["participants"]
              : current.participants,
          } : current);
          return;
        }
        if (message.type === "voice-state" && Array.isArray(message.participants)) {
          setRoom((current) => current ? { ...current, participants: message.participants as WatchRoomData["participants"] } : current);
          return;
        }
        if (message.type === "voice-signal" && message.from && message.signal) {
          voiceSignalHandlerRef.current?.(message as unknown as RoomVoiceSignal);
          return;
        }
        if (message.type === "chat" && message.message && typeof message.message === "object") {
          const chatMessage = message.message as RoomChatMessage;
          setRoom((current) => current && !current.messages.some((item) => item.id === chatMessage.id)
            ? { ...current, messages: [...current.messages, chatMessage] }
            : current);
          return;
        }
        if (message.type === "player") {
          const playerMessage = message as unknown as PlayerMessage;
          const playback = {
            episodeNumber: Number(playerMessage.episodeNumber) || 1,
            position: Number(playerMessage.position) || 0,
            playing: Boolean(playerMessage.playing),
            updatedAt: Number(playerMessage.updatedAt) || Date.now(),
          };
          setRoom((current) => current ? { ...current, playback } : current);
          applyPlayback(playback);
        }
      });
      socket.addEventListener("close", (event) => {
        stopHeartbeat();
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        if (!active) return;
        if (event.code === 1008) {
          setConnectionState("disconnected");
          return;
        }
        setConnectionState("connecting");
        reconnectAttempt += 1;
        const reconnectDelay = Math.min(1_000 * (2 ** Math.min(reconnectAttempt - 1, 3)), 10_000);
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
      });
      socket.addEventListener("error", () => {
        if (socketRef.current === socket) setConnectionState("connecting");
      });
    };

    connect();
    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      stopHeartbeat();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [applyPlayback, code, user.id]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const playerEvent = readKodikPlayerEvent(event, iframeRef.current);
      if (!playerEvent) return;
      if (playerEvent.name === "kodik_player_time_update" || playerEvent.name === "kodik_player_time") {
        currentTimeRef.current = numericPlayerValue(playerEvent.value, "time", "seconds") ?? currentTimeRef.current;
        return;
      }
      if (playerEvent.name === "kodik_player_current_episode") {
        const episodeNumber = Math.floor(numericPlayerValue(playerEvent.value, "episode", "number") ?? currentEpisodeRef.current);
        if (episodeNumber > 0 && episodeNumber !== currentEpisodeRef.current) {
          currentEpisodeRef.current = episodeNumber;
          sendPlayer("episode", 0, episodeNumber);
        }
        return;
      }
      if (playerEvent.name === "kodik_player_video_ended") {
        localPlayingRef.current = false;
        completeCurrentEpisode();
        sendPlayer("pause");
        return;
      }
      if (playerEvent.name === "kodik_player_play") {
        localPlayingRef.current = true;
        if (canControlRef.current) sendPlayer("play");
        return;
      }
      if (playerEvent.name === "kodik_player_pause") {
        localPlayingRef.current = false;
        if (canControlRef.current) sendPlayer("pause");
        return;
      }
      if (!canControlRef.current) return;
      if (playerEvent.name === "kodik_player_seek") {
        const position = numericPlayerValue(playerEvent.value, "time", "seconds") ?? currentTimeRef.current;
        currentTimeRef.current = position;
        sendPlayer("seek", position);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [completeCurrentEpisode, sendPlayer]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [room?.messages.length]);

  const selectedEpisode = useMemo(() => {
    if (!room) return null;
    return episodes.find((episode) => episode.number === room.playback.episodeNumber)
      ?? episodes.find((episode) => episode.embedUrl || episode.videoUrl)
      ?? null;
  }, [episodes, room]);

  const submitChat = (event: FormEvent) => {
    event.preventDefault();
    const content = chatText.trim();
    if (!content || !sendRoomMessage({ type: "chat", content })) return;
    setChatText("");
  };

  const toggleCoHost = (targetUserId: string) => {
    if (!isHost || targetUserId === room?.host.id) return;
    sendRoomMessage({
      type: "controller",
      targetUserId,
      enabled: room?.coHostId !== targetUserId,
    });
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <main className="room-page">
      <Header variant="solid" onNavigateHome={onNavigateHome} user={user} onProfile={onProfile} onLogout={onLogout} />
      <div className="room-shell">
        <header className="room-heading">
          <div><p className="section-kicker">Совместный просмотр</p><h1>{room?.release.title ?? "Комната"}</h1><p>{isHost ? "Вы управляете воспроизведением" : isCoHost ? "Хозяин дал вам управление плеером" : `Хозяин комнаты — ${room?.host.username ?? "…"}`}</p></div>
          <div className="room-heading-actions"><span className={`room-connection ${connectionState}`}>{connectionState === "connected" ? "● В сети" : connectionState === "connecting" ? "◌ Подключаемся" : "○ Нет связи"}</span><button className="favorite-button" type="button" onClick={() => void copyLink()}>{copied ? "Ссылка скопирована" : "Скопировать ссылку"}</button></div>
        </header>
        {error ? <div className="room-error"><h2>Комната недоступна</h2><p>{error}</p><button className="watch-button" onClick={onNavigateHome}>В каталог</button></div> : (
          <div className="room-grid">
            <section className="room-player-panel">
              <div className="video-stage">
                {selectedEpisode?.embedUrl ? (
                  <iframe ref={iframeRef} src={selectedEpisode.embedUrl} title={`Комната: ${room?.release.title ?? "аниме"}`} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen onLoad={() => { if (room) applyPlayback(room.playback); }} />
                ) : selectedEpisode?.videoUrl ? (
                  <video
                    ref={videoRef}
                    controls
                    src={selectedEpisode.videoUrl}
                    poster={release?.bannerUrl ?? release?.posterUrl}
                    onTimeUpdate={(event) => { currentTimeRef.current = event.currentTarget.currentTime; }}
                    onPlay={() => { localPlayingRef.current = true; sendPlayer("play"); }}
                    onPause={() => { localPlayingRef.current = false; sendPlayer("pause"); }}
                    onSeeked={(event) => sendPlayer("seek", event.currentTarget.currentTime)}
                    onEnded={() => { localPlayingRef.current = false; completeCurrentEpisode(); }}
                  />
                ) : <div className="licensed-notice"><h2>Плеер пока недоступен</h2><p>Для этого релиза не найдено видео.</p></div>}
              </div>
              <div className="room-now-playing"><div><small>Сейчас в комнате</small><strong>{room?.playback.episodeNumber ?? 1} серия</strong></div><button className="favorite-button" type="button" onClick={completeCurrentEpisode}>✓ Серия просмотрена</button></div>
              {!canControl ? <p className="room-guest-note">Пауза, запуск и перемотка повторяются за хозяином и соведущим автоматически.</p> : null}
            </section>
            <aside className="room-sidebar">
              <section className="room-participants">
                <h2>Участники <span>{room?.participants.length ?? 0}</span></h2>
                <div>{room?.participants.map((participant) => (
                  <div className="room-participant" key={participant.id}>
                    <span>
                      {participant.username}
                      {participant.id === room.host.id ? " · хост" : participant.id === room.coHostId ? " · соведущий" : ""}
                      {participant.voiceEnabled ? participant.voiceMuted ? " · 🔇" : " · 🎙" : ""}
                    </span>
                    {isHost && participant.id !== room.host.id ? (
                      <button type="button" onClick={() => toggleCoHost(participant.id)}>
                        {participant.id === room.coHostId ? "Убрать управление" : "Дать управление"}
                      </button>
                    ) : null}
                  </div>
                ))}</div>
              </section>
              <section className="room-voice">
                <header><h2>Голосовой чат</h2><span>{room?.participants.filter((participant) => participant.voiceEnabled).length ?? 0} в эфире</span></header>
                <p>{voice.enabled ? voice.muted ? "Ваш микрофон выключен" : "Ваш микрофон включён" : "Подключайтесь и разговаривайте во время просмотра."}</p>
                {voice.error ? <p className="room-voice-error">{voice.error}</p> : null}
                <div className="room-voice-actions">
                  {!voice.enabled ? (
                    <button type="button" onClick={() => void voice.startVoice()} disabled={voice.starting || connectionState !== "connected"}>
                      {voice.starting ? "Подключаем…" : "Войти с микрофоном"}
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={voice.toggleMute}>{voice.muted ? "Включить микрофон" : "Выключить микрофон"}</button>
                      <button className="room-voice-leave" type="button" onClick={() => voice.stopVoice()}>Выйти</button>
                    </>
                  )}
                </div>
                <div className="room-remote-audio" aria-hidden="true">
                  {voice.remoteAudio.map((audio) => <RemoteRoomAudio key={audio.userId} stream={audio.stream} />)}
                </div>
              </section>
              <section className="room-chat"><h2>Чат комнаты</h2><div className="room-messages">{room?.messages.map((message) => <article key={message.id}><header><strong>{message.username}</strong><time>{new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time></header><p>{message.content}</p></article>)}<div ref={chatEndRef} /></div><form onSubmit={submitChat}><textarea value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Сообщение…" maxLength={500} rows={2} /><button type="submit" disabled={!chatText.trim() || connectionState !== "connected"}>Отправить</button></form></section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
