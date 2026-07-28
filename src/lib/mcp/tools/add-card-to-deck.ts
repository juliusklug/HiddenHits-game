import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated } from "../supabase";

export default defineTool({
  name: "add_card_to_deck",
  title: "Add card to deck",
  description: "Add one of the signed-in user's cards to one of their decks.",
  inputSchema: {
    deck_id: z.string().uuid(),
    card_id: z.string().uuid(),
  },
  annotations: { readOnlyHint: false, idempotentHint: true },
  handler: async ({ deck_id, card_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const { error } = await supabaseForUser(ctx)
      .from("deck_cards")
      .insert({ deck_id, card_id, position: Date.now() % 1_000_000 });
    if (error && error.code !== "23505") {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return { content: [{ type: "text", text: `Added card ${card_id} to deck ${deck_id}.` }] };
  },
});
