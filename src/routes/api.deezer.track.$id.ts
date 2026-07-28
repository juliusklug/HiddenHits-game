import { createFileRoute } from "@tanstack/react-router";

// Server route that proxies Deezer's public Track API to avoid CORS.
// Returns just what we need for hidden playback + reveal.
export const Route = createFileRoute("/api/deezer/track/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id?.trim();
        if (!id || !/^\d+$/.test(id)) {
          return Response.json({ error: "Invalid track id" }, { status: 400 });
        }
        try {
          const r = await fetch(`https://api.deezer.com/track/${id}`);
          if (!r.ok) {
            return Response.json(
              { error: "Deezer upstream error", status: r.status },
              { status: 502 },
            );
          }
          const data = (await r.json()) as {
            id?: number;
            title?: string;
            preview?: string;
            release_date?: string;
            link?: string;
            artist?: { name?: string };
            album?: { title?: string; cover_medium?: string; cover_big?: string };
            error?: { message?: string };
          };
          if (data.error) {
            return Response.json({ error: data.error.message ?? "Unknown" }, { status: 404 });
          }
          return Response.json(
            {
              id: data.id,
              title: data.title ?? "",
              artist: data.artist?.name ?? "",
              album: data.album?.title ?? "",
              cover: data.album?.cover_big ?? data.album?.cover_medium ?? "",
              previewUrl: data.preview ?? "",
              releaseYear: data.release_date ? Number(data.release_date.slice(0, 4)) : null,
              deezerUrl: data.link ?? `https://www.deezer.com/track/${id}`,
            },
            {
              headers: {
                "Cache-Control": "public, max-age=86400, s-maxage=86400",
              },
            },
          );
        } catch (err) {
          console.error("[deezer proxy]", err);
          return Response.json({ error: "Fetch failed" }, { status: 502 });
        }
      },
    },
  },
});
