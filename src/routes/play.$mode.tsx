import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy stub — real modes live at /pass-play and /online. */
export const Route = createFileRoute("/play/$mode")({
  beforeLoad: ({ params }) => {
    const mode = params.mode.toLowerCase();
    if (mode === "party" || mode === "classic" || mode === "solo") {
      throw redirect({ to: mode === "solo" ? "/" : "/pass-play" });
    }
    throw redirect({ to: "/" });
  },
});
