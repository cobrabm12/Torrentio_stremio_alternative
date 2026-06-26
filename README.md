# Torrent+ — modern Stremio torrent addon

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
- **Optimized** — concurrent, fault-isolated scrapers, request coalescing and an
  LRU/TTL cache so popular titles resolve instantly.

## Architecture

```
src/
  addon/        Stremio manifest, stream handler & stream formatting
  config/       Env config + URL-encoded per-user settings
  debrid/       RealDebrid / AllDebrid / Premiumize clients
  meta/         Cinemeta IMDB -> title/year resolver
  parser/       Release-title attribute parser (the core)
  process/      Filtering, scoring & sorting pipeline
  scrapers/     Pluggable providers (YTS, EZTV, TPB, Nyaa) + aggregator
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
| `STREAM_CACHE_TTL` | `43200` | Stream cache TTL (s) |
| `DISABLED_PROVIDERS` | – | Comma-separated provider ids to disable |

## Tests

```bash
npm test
```

## Legal

This software is a metadata/indexing tool. It does not host or distribute any
content. You are responsible for complying with the laws of your jurisdiction.
