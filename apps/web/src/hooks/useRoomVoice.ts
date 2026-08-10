import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { apiUrl } from "../api";
import type { RoomParticipant } from "../types";

export type RoomVoiceSignal = {
  type: "voice-signal";
  from: { id: string; username: string };
  signal:
    | { type: "offer" | "answer"; sdp: string }
    | { type: "ice"; candidate: RTCIceCandidateInit };
};

type SendRoomMessage = (message: Record<string, unknown>) => boolean;

type ManagedPeer = {
  connection: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  makingOffer: boolean;
  reconnectTimer: number;
};

type RemoteAudio = { userId: string; stream: MediaStream };

function microphoneError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Разрешите доступ к микрофону в настройках браузера.";
    if (error.name === "NotFoundError") return "Микрофон не найден на этом устройстве.";
    if (error.name === "NotReadableError") return "Микрофон занят другой программой или недоступен.";
  }
  return error instanceof Error ? error.message : "Не удалось подключить микрофон.";
}

export function useRoomVoice({
  code,
  userId,
  participants,
  connectionState,
  sendMessage,
  signalHandlerRef,
}: {
  code: string;
  userId: string;
  participants: RoomParticipant[];
  connectionState: "connecting" | "connected" | "disconnected";
  sendMessage: SendRoomMessage;
  signalHandlerRef: MutableRefObject<((message: RoomVoiceSignal) => void) | null>;
}) {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteAudio, setRemoteAudio] = useState<RemoteAudio[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const peersRef = useRef(new Map<string, ManagedPeer>());
  const participantsRef = useRef(participants);
  const enabledRef = useRef(false);
  const mutedRef = useRef(false);
  const sendMessageRef = useRef(sendMessage);

  participantsRef.current = participants;
  sendMessageRef.current = sendMessage;

  const closePeer = useCallback((remoteUserId: string) => {
    const peer = peersRef.current.get(remoteUserId);
    if (!peer) return;
    window.clearTimeout(peer.reconnectTimer);
    peer.connection.onicecandidate = null;
    peer.connection.ontrack = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.close();
    peersRef.current.delete(remoteUserId);
    setRemoteAudio((current) => current.filter((audio) => audio.userId !== remoteUserId));
  }, []);

  const sendSignal = useCallback((targetUserId: string, signal: RoomVoiceSignal["signal"]) => {
    sendMessageRef.current({ type: "voice-signal", targetUserId, signal });
  }, []);

  const ensurePeer = useCallback((remoteUserId: string): ManagedPeer | null => {
    const existing = peersRef.current.get(remoteUserId);
    if (existing) return existing;
    const stream = localStreamRef.current;
    if (!stream || !enabledRef.current) return null;

    const connection = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const peer: ManagedPeer = { connection, pendingIce: [], makingOffer: false, reconnectTimer: 0 };
    peersRef.current.set(remoteUserId, peer);
    for (const track of stream.getTracks()) connection.addTrack(track, stream);

    connection.onicecandidate = (event) => {
      if (event.candidate) sendSignal(remoteUserId, { type: "ice", candidate: event.candidate.toJSON() });
    };
    connection.ontrack = (event) => {
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteAudio((current) => [
        ...current.filter((audio) => audio.userId !== remoteUserId),
        { userId: remoteUserId, stream: remoteStream },
      ]);
    };
    connection.onconnectionstatechange = () => {
      window.clearTimeout(peer.reconnectTimer);
      if (connection.connectionState !== "failed" && connection.connectionState !== "disconnected") return;
      peer.reconnectTimer = window.setTimeout(() => {
        if (connection.connectionState !== "failed" && connection.connectionState !== "disconnected") return;
        closePeer(remoteUserId);
        const remoteStillAvailable = participantsRef.current.some(
          (participant) => participant.id === remoteUserId && participant.voiceEnabled,
        );
        if (enabledRef.current && remoteStillAvailable && userId.localeCompare(remoteUserId) < 0) {
          window.setTimeout(() => void createOfferRef.current(remoteUserId), 500);
        }
      }, connection.connectionState === "failed" ? 500 : 8_000);
    };
    return peer;
  }, [closePeer, sendSignal, userId]);

  const createOfferRef = useRef<(remoteUserId: string) => Promise<void>>(async () => undefined);
  createOfferRef.current = async (remoteUserId: string) => {
    const peer = ensurePeer(remoteUserId);
    if (!peer || peer.makingOffer || peer.connection.signalingState !== "stable") return;
    peer.makingOffer = true;
    try {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      if (peer.connection.localDescription?.sdp) {
        sendSignal(remoteUserId, { type: "offer", sdp: peer.connection.localDescription.sdp });
      }
    } catch {
      closePeer(remoteUserId);
    } finally {
      peer.makingOffer = false;
    }
  };

  const handleSignal = useCallback(async (message: RoomVoiceSignal) => {
    if (!enabledRef.current || message.from.id === userId) return;
    const peer = ensurePeer(message.from.id);
    if (!peer) return;
    try {
      if (message.signal.type === "ice") {
        if (peer.connection.remoteDescription) {
          await peer.connection.addIceCandidate(message.signal.candidate);
        } else {
          peer.pendingIce.push(message.signal.candidate);
        }
        return;
      }
      if (message.signal.type === "offer") {
        if (peer.connection.signalingState !== "stable") {
          await peer.connection.setLocalDescription({ type: "rollback" });
        }
        await peer.connection.setRemoteDescription({ type: "offer", sdp: message.signal.sdp });
        for (const candidate of peer.pendingIce.splice(0)) await peer.connection.addIceCandidate(candidate);
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        if (peer.connection.localDescription?.sdp) {
          sendSignal(message.from.id, { type: "answer", sdp: peer.connection.localDescription.sdp });
        }
        return;
      }
      await peer.connection.setRemoteDescription({ type: "answer", sdp: message.signal.sdp });
      for (const candidate of peer.pendingIce.splice(0)) await peer.connection.addIceCandidate(candidate);
    } catch {
      closePeer(message.from.id);
    }
  }, [closePeer, ensurePeer, sendSignal, userId]);

  useEffect(() => {
    signalHandlerRef.current = (message) => void handleSignal(message);
    return () => {
      signalHandlerRef.current = null;
    };
  }, [handleSignal, signalHandlerRef]);

  useEffect(() => {
    if (!enabled) return;
    const availableIds = new Set(
      participants.filter((participant) => participant.id !== userId && participant.voiceEnabled)
        .map((participant) => participant.id),
    );
    for (const remoteUserId of peersRef.current.keys()) {
      if (!availableIds.has(remoteUserId)) closePeer(remoteUserId);
    }
    for (const remoteUserId of availableIds) {
      ensurePeer(remoteUserId);
      if (userId.localeCompare(remoteUserId) < 0) void createOfferRef.current(remoteUserId);
    }
  }, [closePeer, enabled, ensurePeer, participants, userId]);

  useEffect(() => {
    if (connectionState === "connected" && enabledRef.current) {
      sendMessageRef.current({ type: "voice-state", enabled: true, muted: mutedRef.current });
    }
  }, [connectionState]);

  const stopVoice = useCallback((notifyServer = true) => {
    if (notifyServer && enabledRef.current) {
      sendMessageRef.current({ type: "voice-state", enabled: false, muted: false });
    }
    enabledRef.current = false;
    mutedRef.current = false;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    for (const remoteUserId of [...peersRef.current.keys()]) closePeer(remoteUserId);
    setEnabled(false);
    setMuted(false);
    setStarting(false);
  }, [closePeer]);

  useEffect(() => () => stopVoice(true), [code, stopVoice]);

  const startVoice = useCallback(async () => {
    if (enabledRef.current || starting) return;
    if (connectionState !== "connected") {
      setError("Дождитесь подключения к комнате.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setError("Этот браузер не поддерживает голосовой чат.");
      return;
    }
    setStarting(true);
    setError(null);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      const response = await fetch(`${apiUrl}/rooms/${encodeURIComponent(code)}/voice-config`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null) as {
        data?: { iceServers?: RTCIceServer[] };
        message?: string;
      } | null;
      if (!response.ok || !payload?.data?.iceServers?.length) {
        throw new Error(payload?.message ?? "Голосовой сервер недоступен.");
      }
      iceServersRef.current = payload.data.iceServers;
      localStreamRef.current = stream;
      enabledRef.current = true;
      mutedRef.current = false;
      setEnabled(true);
      setMuted(false);
      if (!sendMessageRef.current({ type: "voice-state", enabled: true, muted: false })) {
        throw new Error("Соединение с комнатой прервано.");
      }
    } catch (startError) {
      stream?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      enabledRef.current = false;
      setEnabled(false);
      setError(microphoneError(startError));
    } finally {
      setStarting(false);
    }
  }, [code, connectionState, starting]);

  const toggleMute = useCallback(() => {
    if (!enabledRef.current || !localStreamRef.current) return;
    const nextMuted = !mutedRef.current;
    for (const track of localStreamRef.current.getAudioTracks()) track.enabled = !nextMuted;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    sendMessageRef.current({ type: "voice-state", enabled: true, muted: nextMuted });
  }, []);

  return { enabled, muted, starting, error, remoteAudio, startVoice, stopVoice, toggleMute };
}
