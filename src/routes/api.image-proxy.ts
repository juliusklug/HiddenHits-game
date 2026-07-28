import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_IMAGE_HOSTS = new Set([
  "cdn-images.dzcdn.net",
  "e-cdns-images.dzcdn.net",
  "cdns-images.dzcdn.net",
  "cdns-images.deezer.com",
  "i.scdn.co",
  "mosaic.scdn.co",
  "image-cdn-ak.spotifycdn.com",
]);

export const Route = createFileRoute("/api/image-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const rawUrl = requestUrl.searchParams.get("url");
        if (!rawUrl) {
          return Response.json({ error: "Missing image URL" }, { status: 400 });
        }

        let sourceUrl: URL;
        try {
          sourceUrl = new URL(rawUrl);
        } catch {
          return Response.json({ error: "Invalid image URL" }, { status: 400 });
        }

        if (sourceUrl.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(sourceUrl.hostname)) {
          return Response.json({ error: "Image host is not allowed" }, { status: 400 });
        }

        try {
          const upstream = await fetch(sourceUrl, {
            headers: { Accept: "image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5" },
          });
          if (!upstream.ok || !upstream.body) {
            return Response.json({ error: "Image fetch failed" }, { status: 502 });
          }

          const contentType = upstream.headers.get("content-type") ?? "";
          if (!contentType.startsWith("image/")) {
            return Response.json({ error: "URL did not return an image" }, { status: 415 });
          }

          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (error) {
          console.error("[image proxy]", error);
          return Response.json({ error: "Image proxy failed" }, { status: 502 });
        }
      },
    },
  },
});