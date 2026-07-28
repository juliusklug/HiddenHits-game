import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated } from "../supabase";

export default defineTool({
  name: "list_deck_cards",
  title: "List cards in a deck",
  description: "List the cards inside one of the signed-in user's decks (ordered by position).",
  inputSchema: { deck_id: z.string().uuid().describe("Deck id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deck_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("deck_cards")
      .select("position, card:cards(id, title, artist, release_year, album, track_id)")
      .eq("deck_id", deck_id)
      .order("position", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { entries: data ?? [] },
    };
  },
});
