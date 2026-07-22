import { config } from "../../config.js";

export function cloudflareStreamEmbedUrl(videoUid: string | null): string | null {
  if (!videoUid || !config.cloudflareStreamCustomerCode) return null;

  const uid = encodeURIComponent(videoUid.trim());
  if (!uid) return null;

  return `https://customer-${config.cloudflareStreamCustomerCode}.cloudflarestream.com/${uid}/iframe?controls=true&preload=metadata`;
}
