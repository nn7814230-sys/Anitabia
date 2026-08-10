export type ReleaseStatus = "ongoing" | "completed" | "announced";

export interface Release {
  id: string;
  slug: string;
  title: string;
  originalTitle: string | null;
  description: string;
  posterUrl: string;
  bannerUrl: string | null;
  trailerUrl: string | null;
  officialUrl: string | null;
  releaseYear: number;
  releaseType: "series" | "movie" | "ova" | "ona";
  status: ReleaseStatus;
  episodesTotal: number | null;
  episodesReleased: number;
  rating: number | null;
  ageRating: string;
  genres: string[];
}

export interface Episode {
  id: string;
  number: number;
  title: string | null;
  durationSeconds: number | null;
  videoUrl: string | null;
  embedUrl: string | null;
  videoProvider: "kodik" | "native" | null;
  publishedAt: string | null;
}

export interface CalendarEntry {
  shikimoriId: number;
  animeName: string;
  animeRussian: string | null;
  posterUrl: string | null;
  nextEpisode: number | null;
  nextEpisodeAt: string | null;
  durationMinutes: number | null;
  animeKind: string | null;
  score: number | null;
  status: string | null;
  episodesTotal: number | null;
  episodesAired: number | null;
  airedOn: string | null;
  releasedOn: string | null;
}

export interface AccountUser {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface WatchHistoryItem extends Release {
  lastWatchedAt: string;
  episodeNumber: number | null;
}

export type ReleaseListStatus = "planned" | "watching" | "completed";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  iconUrl: string;
  awardedAt: string | null;
}

export interface ProfileStats {
  completedEpisodes: number;
  completedTitles: number;
  comments: number;
  longComments: number;
}

export interface ReleaseComment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; username: string };
  isOwn: boolean;
}

export interface RoomParticipant {
  id: string;
  username: string;
  voiceEnabled: boolean;
  voiceMuted: boolean;
}

export interface RoomChatMessage {
  id: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}

export interface WatchRoomData {
  code: string;
  host: { id: string; username: string };
  coHostId: string | null;
  release: { slug: string; title: string; posterUrl: string };
  playback: { episodeNumber: number; position: number; playing: boolean; updatedAt: number };
  participants: RoomParticipant[];
  messages: RoomChatMessage[];
  createdAt: string;
  url?: string;
}

export interface ProfileData {
  user: AccountUser;
  favorites: Release[];
  history: WatchHistoryItem[];
  achievements: Achievement[];
  stats: ProfileStats;
  releaseStatuses: Array<{ releaseId: string; status: ReleaseListStatus }>;
}
