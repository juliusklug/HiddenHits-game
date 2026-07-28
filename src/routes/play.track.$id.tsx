import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { HiddenPlayer } from "@/components/HiddenPlayer";

export const Route = createFileRoute("/play/track/$id")({
  head: () => ({
    meta: [
      { title: "Now playing — HiddenHits" },
      { name: "description", content: "Listen and guess the year. All song info is hidden until you reveal." },
      // Prevent share previews leaking the answer.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrackPage,
});

function TrackPage() {
  const { id } = useParams({ from: "/play/track/$id" });
  const navigate = useNavigate();
  return (
    <HiddenPlayer
      trackId={id}
      onSkip={() => navigate({ to: "/scan" })}
    />
  );
}
