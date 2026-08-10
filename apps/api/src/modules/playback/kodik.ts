const kodikHosts = ["kodik.cc", "kodikplayer.com"];

function isKodikHost(hostname: string): boolean {
  return kodikHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/**
 * Returns a safe URL for the Kodik iframe. Player links are stored in the
 * database, so validate both the protocol and host before returning them to a
 * browser client.
 */
export function kodikEmbedUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.protocol !== "https:" || !isKodikHost(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
