import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated } from "../supabase";

export default defineTool({
  name: "delete_card",
  title: "Delete a card",
  description: "Delete one of the signed-in user's cards by id.",
  inputSchema: { card_id: z.string().uuid().describe("Card id to delete.") },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  handler: async ({ card_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const { error } = await supabaseForUser(ctx).from("cards").delete().eq("id", card_id);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: `Deleted card ${card_id}.` }] };
  },
});
