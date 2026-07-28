# Routes

TanStack Start uses **file-based routing**. Every `.tsx` / `.ts` file in this directory
is a route. Do **not** create `src/pages/` or Next.js-style `app/layout.tsx`.

## Layouts

| File | Role |
| --- | --- |
| `__root.tsx` | Document shell (`<html>`, providers, `<Outlet />`) — wraps every page |
| `_shell.tsx` | Pathless layout: shared `AppShell` (bottom nav). Child routes live in `_shell/` |

API, MCP, Spotify callback, and fullscreen track playback stay **outside** `_shell`
so they do not remount or inherit the tab bar.

## Conventions

| File | URL |
| --- | --- |
| `_shell/index.tsx` | `/` |
| `_shell/scan.tsx` | `/scan` |
| `_shell/online_.room.$code.tsx` | `/online/room/:code` (pathless `online_`) |
| `play.track.$id.tsx` | `/play/track/:id` (no shell) |
| `_shell.tsx` | pathless layout route |
| `__root.tsx` | app document root |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.
