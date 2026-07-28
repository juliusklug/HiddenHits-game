import { createFileRoute } from "@tanstack/react-router";

// Proxy to Deezer's public search endpoint (avoids CORS, adds caching).
export const Route = createFileRoute("/api/deezer/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").trim();
        if (!q) return Response.json({ data: [] });
        try {
          const r = await fetch(
            `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=20`,
          );
          if (!r.ok) {
            return Response.json({ error: "upstream", status: r.status }, { status: 502 });
          }
          const json = (await r.json()) as {
            data?: Array<{
              id: number;
              title: string;
              preview?: string;
              artist?: { name?: string };
              album?: { title?: string; cover_medium?: string; cover_big?: string };
            }>;
          };
          const data = (json.data ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            artist: t.artist?.name ?? "",
            album: t.album?.title ?? "",
            cover: t.album?.cover_medium ?? t.album?.cover_big ?? "",
            previewUrl: t.preview ?? "",
          }));
          return Response.json(
            { data },
            { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } },
          );
        } catch (err) {
          console.error("[deezer search]", err);
          return Response.json({ error: "fetch failed" }, { status: 502 });
        }
      },
    },
  },
});
