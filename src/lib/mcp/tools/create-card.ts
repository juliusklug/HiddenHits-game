import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated } from "../supabase";
import { buildDeezerQR } from "@/lib/card-payload";

export default defineTool({
  name: "create_card",
  title: "Create a card",
  description:
    "Create a new music card for the signed-in user from a Deezer track. Use `search_deezer` first to find the track_id.",
  inputSchema: {
    title: z.string().min(1).describe("Song title."),
    artist: z.string().min(1).describe("Artist name."),
    track_id: z.string().min(1).describe("Deezer track id (as a string)."),
    release_year: z.number().int().min(1900).max(2100).nullable().optional(),
    album: z.string().optional(),
    cover_url: z.string().url().optional(),
    preview_url: z.string().url().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const payload = {
      user_id: ctx.getUserId(),
      title: input.title,
      artist: input.artist,
      release_year: input.release_year ?? null,
      track_id: input.track_id,
      cover_url: input.cover_url ?? null,
      preview_url: input.preview_url ?? null,
      album: input.album ?? null,
      qr_payload: buildDeezerQR(input.track_id),
      source: "deezer",
    };
    const { data, error } = await supabaseForUser(ctx).from("cards").insert(payload).select("*").single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created card ${data.id} — ${data.title} by ${data.artist}.` }],
      structuredContent: { card: data },
    };
  },
});
