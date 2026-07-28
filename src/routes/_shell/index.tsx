import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine, Smartphone, Sparkles, Wifi } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_shell/")({
  head: () => ({
    meta: [
      { title: "HiddenHits — Scan, play, guess the year" },
      { name: "description", content: "Scan QR cards, hear a hidden song, place it on your timeline. The modern music party game you build yourself." },
      { property: "og:title", content: "HiddenHits" },
      { property: "og:description", content: "Scan QR cards, hear a hidden song, guess the year." },
    ],
  }),
  component: Home,
});

function Home() {
  const { user } = useAuth();
  return (
    <>
      {/* Animated background — orbs + particles */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full opacity-60 blur-3xl animate-float"
             style={{ background: "radial-gradient(circle, var(--neon-pink) 0%, transparent 65%)" }} />
        <div className="absolute top-40 -right-20 h-80 w-80 rounded-full opacity-50 blur-3xl animate-float"
             style={{ background: "radial-gradient(circle, var(--neon-blue) 0%, transparent 65%)", animationDelay: "2.5s" }} />
        <div className="absolute bottom-32 left-1/3 h-64 w-64 rounded-full opacity-40 blur-3xl animate-float"
             style={{ background: "radial-gradient(circle, var(--neon-orange) 0%, transparent 65%)", animationDelay: "5s" }} />
        {/* Particles */}
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="absolute bottom-0 h-1 w-1 rounded-full bg-white/70 animate-drift"
            style={{
              left: `${(i * 73) % 100}%`,
              animationDelay: `${(i * 0.6) % 8}s`,
              // @ts-expect-error css var
              "--dx": `${((i * 37) % 60) - 30}px`,
            }}
          />
        ))}
      </div>

      <section className="relative px-5 pt-12 pb-8">
        {/* Hero rainbow motif */}
        <div className="relative mx-auto mb-6 flex h-40 w-40 items-center justify-center">
          <div className="absolute inset-0 rounded-full gradient-rainbow opacity-90 blur-md animate-spin-slower" />
          <div className="absolute inset-2 rounded-full gradient-rainbow animate-spin-slow" />
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-[var(--background)] shadow-card">
            <ScanLine className="h-10 w-10 text-white" strokeWidth={2} />
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-[var(--neon-pink)]" />
          Music timeline party game · QR powered
        </div>
        <h1 className="mt-5 text-5xl font-bold leading-[1.05] tracking-tight">
          Hidden<br />
          <span className="text-gradient-rainbow">Hits.</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-muted-foreground">
          Scan a card. A song plays. No title, no artist, no year — just
          guess where it belongs on your timeline.
        </p>

        <Link
          to="/scan"
          className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-2xl gradient-neon px-6 py-5 text-lg font-semibold text-white animate-neon-pulse transition-transform active:scale-[0.98]"
        >
          <ScanLine className="h-6 w-6" strokeWidth={2.5} />
          Scan a card
        </Link>
      </section>

      <section className="relative space-y-3 px-5 pb-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Choose a game mode
        </div>
        <Link
          to="/online"
          className="flex items-center justify-between rounded-2xl glass-strong px-5 py-4 transition-transform active:scale-[0.98]"
        >
          <span>
            <span className="block text-base font-semibold">
              Online <span className="text-gradient-rainbow">Multiplayer</span>
            </span>
            <span className="block text-xs text-muted-foreground">
              Multi-device · join with a 4-digit room code
            </span>
          </span>
          <Wifi className="h-5 w-5 text-[var(--neon-blue)]" />
        </Link>

        <Link
          to="/pass-play"
          className="flex items-center justify-between rounded-2xl glass-strong px-5 py-4 transition-transform active:scale-[0.98]"
        >
          <span>
            <span className="block text-base font-semibold">
              Pass <span className="text-gradient-rainbow">&amp; Play</span>
            </span>
            <span className="block text-xs text-muted-foreground">
              Single device · 2–8 players pass the phone
            </span>
          </span>
          <Smartphone className="h-5 w-5 text-[var(--neon-pink)]" />
        </Link>
      </section>


      {!user && (
        <section className="relative px-5 pb-12">
          <div className="relative overflow-hidden rounded-2xl glass p-5">
            <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full gradient-rainbow opacity-25 blur-2xl" />
            <div className="relative">
              <div className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                Sync your progress
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Create a free account to save stats, history and cards across every device.
              </p>
              <Link
                to="/auth"
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--neon-pink)]"
              >
                Sign in or create account →
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
