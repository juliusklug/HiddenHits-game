import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCardsTool from "./tools/list-cards";
import createCardTool from "./tools/create-card";
import deleteCardTool from "./tools/delete-card";
import listDecksTool from "./tools/list-decks";
import createDeckTool from "./tools/create-deck";
import listDeckCardsTool from "./tools/list-deck-cards";
import addCardToDeckTool from "./tools/add-card-to-deck";
import searchDeezerTool from "./tools/search-deezer";
import getProfileTool from "./tools/get-profile";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "hiddenhits-yourself-mcp",
  title: "HiddenHits",
  version: "0.1.0",
  instructions:
    "Tools for a signed-in HiddenHits user. Manage your music cards and decks, search Deezer for tracks to add as cards, and read your profile and stats. All actions run as the authenticated user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getProfileTool,
    listCardsTool,
    createCardTool,
    deleteCardTool,
    listDecksTool,
    createDeckTool,
    listDeckCardsTool,
    addCardToDeckTool,
    searchDeezerTool,
  ],
});
