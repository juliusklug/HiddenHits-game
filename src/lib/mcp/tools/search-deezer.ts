import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

type DeezerHit = {
  id: number;
  title: string;
  artist: { name: string };
  album: { title: string; cover_medium: string };
  preview: string;
};

export default defineTool({
  name: "search_deezer",
  title: "Search Deezer",
  description:
    "Search Deezer for tracks by free text (song, artist, or both). Returns candidates with `track_id` you can pass to `create_card`.",
  inputSchema: {
    query: z.string().min(1).describe("Free-text search, e.g. 'daft punk one more time'."),
    limit: z.number().int().min(1).max(25).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query, limit }) => {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit ?? 10}`;
    const r = await fetch(url);
    if (!r.ok) {
      return { content: [{ type: "text", text: `Deezer search failed (${r.status})` }], isError: true };
    }
    const json = (await r.json()) as { data?: DeezerHit[] };
    const results = (json.data ?? []).map((t) => ({
      track_id: String(t.id),
      title: t.title,
      artist: t.artist?.name,
      album: t.album?.title,
      cover_url: t.album?.cover_medium,
      preview_url: t.preview,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      structuredContent: { results },
    };
  },
});
