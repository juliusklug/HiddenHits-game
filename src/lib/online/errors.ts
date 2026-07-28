/**
 * Supabase/PostgREST errors are plain objects, not Error instances, so
 * `String(e)` renders as "[object Object]". Always format through this.
 */
export function errorMessage(e: unknown, fallback = "Something went wrong."): string {
  if (!e) return fallback;
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );
    if (parts.length) return parts.join(" — ");
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}") return json;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}
