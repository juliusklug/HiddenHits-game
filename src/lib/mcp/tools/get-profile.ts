import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, notAuthenticated } from "../supabase";

export default defineTool({
  name: "get_profile",
  title: "Get my profile",
  description: "Return the signed-in user's profile row and basic stats (cards and decks count).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const sb = supabaseForUser(ctx);
    const [profile, cards, decks] = await Promise.all([
      sb.from("profiles").select("*").eq("id", ctx.getUserId()).maybeSingle(),
      sb.from("cards").select("id", { count: "exact", head: true }),
      sb.from("decks").select("id", { count: "exact", head: true }),
    ]);
    const result = {
      user_id: ctx.getUserId(),
      email: ctx.getUserEmail(),
      profile: profile.data ?? null,
      cards_count: cards.count ?? 0,
      decks_count: decks.count ?? 0,
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
  },
});
