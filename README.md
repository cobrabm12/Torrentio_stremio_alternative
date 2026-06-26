# Torrent+ — modern Stremio torrent addon

![CI](https://github.com/cobrabm12/Torrentio_stremio_alternative/actions/workflows/ci.yml/badge.svg)

A fast, modern, optimized alternative to Torrentio. It finds torrent streams
for movies and series and exposes them to [Stremio](https://www.stremio.com/)
with **advanced quality, audio, HDR and language control** plus optional
**debrid** support (RealDebrid, AllDebrid, Premiumize).

## Why it's different from Torrentio

- **Deep release parsing** — detects resolution, source (REMUX/BluRay/WEB-DL…),
  video codec (HEVC/AV1/AVC), HDR variants (**Dolby Vision, HDR10+, HLG**),
  bit depth, and detailed audio: **Atmos, DTS-X, TrueHD, DTS-HD, EAC3/DD+…**
  and channel layouts (**5.1 / 7.1**).
- **Granular filtering** — pick exactly which qualities, audio codecs, channels,
  video codecs and languages you want, plus HDR-only mode, size and seeder
  bounds.
- **Smart scoring** — results are ranked by a tunable quality score (resolution +
  source + audio + HDR + health), not just seeders.
- **Lazy/hybrid cache** — instead of pre-scraping the whole torrent universe like
  Torrentio's backend, results are scraped on demand and **persisted to SQLite**.
  The first lookup for a title scrapes (~2-4s); every later request, for any
  user, is served from disk in milliseconds. The DB grows only with real usage
  (MBs, not tens of GBs).
- **Season packs** — for series we also search complete-season/series packs and
  resolve the correct episode's file index (by fetching and parsing the
  `.torrent` file list), so packs play the right episode in both P2P and debrid.
- **Optimized** — concurrent, fault-isolated scrapers, request coalescing and an
  in-memory + SQLite cache so popular titles resolve instantly.

## Architecture

```
src/
  addon/        Stremio manifest, stream handler & stream formatting
  config/       Env config + URL-encoded per-user settings
  debrid/       RealDebrid / AllDebrid / Premiumize clients
  meta/         Cinemeta IMDB -> title/year resolver
  parser/       Release-title attribute parser (the core)
  process/      Filtering, scoring & sorting pipeline
  scrapers/     Pluggable providers (YTS, EZTV, TPB, 1337x, Nyaa) + aggregator
  store/        Persistent lazy cache (SQLite)
  torrent/      .torrent file-list resolver for season packs
  cache.ts      LRU + request coalescing
  server.ts     Fastify routes
public/
  configure.html  Modern configuration UI
```

Adding a provider is just implementing the `Scraper` interface in
`src/scrapers/` and registering it in `src/scrapers/index.ts`.

## Run locally

```bash
npm install
npm run dev          # hot-reload dev server on :7000
# or
npm run build && npm start
```

Then open <http://localhost:7000/configure>, choose your options and click
**Install in Stremio**.

### Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `7000` | Listen port |
| `BASE_URL` | derived | Public URL (needed for debrid resolve links) |
| `SCRAPE_TIMEOUT_MS` | `8000` | Per-provider request timeout |
| `STREAM_CACHE_TTL` | `43200` | In-memory cache TTL (s) |
| `DATA_DIR` | `./data` | SQLite store directory |
| `MEDIA_TTL` | `86400` | How long stored torrents stay fresh (s) |
| `DISABLED_PROVIDERS` | – | Comma-separated provider ids to disable |

## Deploy

The addon ships as a small multi-stage Docker image (runs as a non-root user,
persists the SQLite cache to a volume).

> **Important:** set `BASE_URL` to the public URL of your instance. Debrid
> playback links point back at this addon, so they break if `BASE_URL` is wrong.

### Docker

Build locally:

```bash
docker build -t torrentplus .
docker run -d --name torrentplus -p 7000:7000 \
  -e BASE_URL=https://your-domain.example \
  -v torrentplus-data:/app/data \
  torrentplus
```

Or pull the image published by CI on the default branch:

```bash
docker run -d --name torrentplus -p 7000:7000 \
  -e BASE_URL=https://your-domain.example \
  -v torrentplus-data:/app/data \
  ghcr.io/cobrabm12/torrentio_stremio_alternative:latest
```

### docker compose

```bash
BASE_URL=https://your-domain.example docker compose up -d
```

### Fly.io

```bash
fly apps create torrentplus
fly volumes create torrentplus_data --size 1 --region ams
fly secrets set BASE_URL=https://<your-app>.fly.dev
fly deploy
```

Then open `https://<your-domain>/configure`, pick your options (and paste your
RealDebrid token), and click **Install in Stremio**.

## Tests

```bash
npm test
```

## Legal

This software is a metadata/indexing tool. It does not host or distribute any
content. You are responsible for complying with the laws of your jurisdiction.
