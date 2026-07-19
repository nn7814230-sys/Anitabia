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
  publishedAt: string | null;
}
