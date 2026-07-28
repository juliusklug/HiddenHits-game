import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthenticated } from "../supabase";

export default defineTool({
  name: "create_deck",
  title: "Create a deck",
  description: "Create a new empty deck for the signed-in user.",
  inputSchema: {
    name: z.string().min(1).describe("Deck name."),
    description: z.string().optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: false },
  handler: async ({ name, description }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("decks")
      .insert({ user_id: ctx.getUserId(), name, description: description ?? null })
      .select("*")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created deck ${data.id} — ${data.name}.` }],
      structuredContent: { deck: data },
    };
  },
});
