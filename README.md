# HiddenHits

Scan QR-coded music cards, play the song instantly (metadata hidden), and guess where it belongs on a timeline.

**Live app**: https://hiddenhits.lovable.app

## Features

- **QR scanner** — camera-based card scan with flashlight support
- **Hidden playback** — Deezer previews by default; optional Spotify Web Playback (Premium)
- **Custom cards & decks** — create cards, generate QR codes, export printable PDFs
- **Pass & Play** — single-device party mode (2–8 players)
- **Online multiplayer** — join with a 4-digit room code

## Stack

- TanStack Start / Router + React 19 + Vite + Tailwind CSS 4
- Supabase (Auth, Postgres, Realtime)
- Spotify Web Playback SDK + Deezer API

## Development

```sh
cd hiddenhits-main
npm i
npm run dev
```

Requires Node.js and a configured `.env` with Supabase (and optional Spotify) credentials.

This project was built with [Lovable](https://lovable.dev). Continue in the [Lovable editor](https://lovable.dev/projects/635a0c15-683d-417b-8b87-89727d33111d) or work locally — changes to `main` sync both ways.
