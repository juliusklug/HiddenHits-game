/**
 * QR payload helpers.
 *
 * Accepted card payloads:
 *   - hiddenhits:deezer:<trackId>  (current)
 *   - hitster:deezer:<trackId>     (legacy cards printed before rebranding)
 *   - https://www.deezer.com/track/<id>  (or /xx/track/<id>)
 *   - https://deezer.page.link/...  (not resolved here)
 *   - a bare numeric string -> treated as Deezer track id
 */
export type ParsedCard =
  | { kind: "deezer"; trackId: string }
  | { kind: "unknown"; raw: string };

export function parseCardPayload(raw: string): ParsedCard {
  const s = raw.trim();

  // hiddenhits:deezer:123 (or legacy hitster: prefix)
  const m1 = s.match(/^(?:hiddenhits|hitster):deezer:(\d+)$/i);
  if (m1) return { kind: "deezer", trackId: m1[1] };

  // deezer.com/.../track/<id>
  const m2 = s.match(/deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/i);
  if (m2) return { kind: "deezer", trackId: m2[1] };

  // Bare number
  if (/^\d{3,}$/.test(s)) return { kind: "deezer", trackId: s };

  return { kind: "unknown", raw: s };
}

/** Build a canonical QR string for a Deezer track. */
export function buildDeezerQR(trackId: string | number): string {
  return `hiddenhits:deezer:${trackId}`;
}
