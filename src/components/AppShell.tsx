import { Link, useRouterState } from "@tanstack/react-router";
import { ScanLine, Library, User, Music2, Wifi } from "lucide-react";
import type { ReactNode } from "react";

const tabs: ReadonlyArray<{
  to: "/" | "/scan" | "/cards" | "/profile" | "/online";
  label: string;
  Icon: typeof ScanLine;
  primary?: boolean;
}> = [
  { to: "/", label: "Home", Icon: Music2 },
  { to: "/scan", label: "Scan", Icon: ScanLine, primary: true },
  { to: "/online", label: "Online", Icon: Wifi },
  { to: "/cards", label: "Cards", Icon: Library },
  { to: "/profile", label: "Profile", Icon: User },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="relative mx-auto flex min-h-[100svh] w-full max-w-screen-sm flex-col">
      <main className="flex-1 pb-28">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-screen-sm px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <ul className="glass-strong flex items-center justify-around rounded-full px-2 py-2 shadow-card">
          {tabs.map(({ to, label, Icon, primary }) => {
            const active =
              to === "/" ? pathname === "/" : pathname.startsWith(to);
            if (primary) {
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className="relative -mt-8 flex h-16 w-16 items-center justify-center rounded-full text-white animate-neon-pulse transition-transform active:scale-95"
                    style={{ background: "var(--gradient-rainbow)" }}
                    aria-label={label}
                  >
                    <span className="absolute inset-[3px] rounded-full bg-[var(--background)]" />
                    <Icon className="relative h-7 w-7" strokeWidth={2.5} />
                  </Link>
                </li>
              );
            }
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={
                    "flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs transition-colors " +
                    (active
                      ? "text-[var(--neon-pink)]"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
