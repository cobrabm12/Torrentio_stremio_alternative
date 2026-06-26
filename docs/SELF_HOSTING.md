# Self-hosting on your own server (Docker + public HTTPS)

This guide runs Torrent+ on a home server with Docker and exposes it publicly
over HTTPS so Stremio works from anywhere (mobile data, Stremio Web, etc.).

> **Why HTTPS / a public URL?** Stremio Web and browsers block plain-HTTP
> addons, and debrid playback links point back at this addon — so the addon
> must be reachable at a real `https://` URL. `BASE_URL` must match that URL
> exactly or debrid playback breaks.

---

## 1. Run the app with Docker

On the server:

```bash
git clone https://github.com/cobrabm12/Torrentio_stremio_alternative.git
cd Torrentio_stremio_alternative

# Build and start. Set BASE_URL to your final public URL (see step 2).
BASE_URL=https://torrent.example.com docker compose up -d --build
```

This starts the addon on `http://localhost:7000`, with the lazy SQLite cache
persisted in a named volume (`torrentplus-data`). Check it:

```bash
curl -s http://localhost:7000/manifest.json
docker compose logs -f
```

Now expose it publicly with **one** of the options below.

---

## 2a. Recommended: Cloudflare Tunnel (no port forwarding)

Best for a home server: no open ports, your home IP stays hidden, HTTPS is
automatic. Requires a domain managed in Cloudflare (free plan is fine).

```bash
# Install cloudflared (Debian/Ubuntu example)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authenticate and create a named tunnel
cloudflared tunnel login
cloudflared tunnel create torrentplus

# Route a hostname to the local app
cloudflared tunnel route dns torrentplus torrent.example.com
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: torrentplus
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: torrent.example.com
    service: http://localhost:7000
  - service: http_status:404
```

Run it as a service:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Your addon is now live at `https://torrent.example.com`. Make sure you started
the container with `BASE_URL=https://torrent.example.com`.

---

## 2b. You already run Caddy with other sites/subdomains

If your server already serves several sites through one Caddy instance, **don't**
add another Caddy — just add a subdomain block pointing at this app. Pick the
variant matching how your Caddy runs.

### Caddy runs on the host (systemd)

Bind the app to localhost only (not exposed on the LAN) — drop this
`docker-compose.override.yml` next to the repo's compose file:

```yaml
services:
  torrentplus:
    ports:
      - "127.0.0.1:7000:7000"
```

Start it:

```bash
BASE_URL=https://torrent.example.com docker compose up -d --build
```

Add to your existing **Caddyfile** (alongside your other site blocks):

```
torrent.example.com {
    reverse_proxy localhost:7000
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy        # or: caddy reload --config /etc/caddy/Caddyfile
```

### Caddy runs in Docker

Attach the app to the same Docker network as your Caddy container and reach it
by container name. Assuming your Caddy uses an external network called `web`,
add a `docker-compose.override.yml`:

```yaml
services:
  torrentplus:
    # No published ports needed — Caddy reaches it over the shared network.
    ports: !reset []
    networks:
      - web

networks:
  web:
    external: true
```

Then in your existing **Caddyfile**:

```
torrent.example.com {
    reverse_proxy torrentplus:7000
}
```

Reload Caddy (e.g. `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile`).

> Whichever variant: `BASE_URL` must equal `https://torrent.example.com`, and
> add a DNS record for `torrent.example.com` pointing at your server (same as
> your other subdomains). Caddy will issue the certificate automatically.

---

## 2c. Alternative: dedicated Caddy reverse proxy + port forwarding

Use this if you'd rather forward ports than use Cloudflare. Requires:
- a domain (or a free DuckDNS hostname) pointing at your home IP, and
- ports **80** and **443** forwarded from your router to the server.

Add Caddy to the stack — create `docker-compose.override.yml`:

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on:
      - torrentplus

volumes:
  caddy-data:
```

Create `Caddyfile`:

```
torrent.example.com {
    reverse_proxy torrentplus:7000
}
```

Then:

```bash
BASE_URL=https://torrent.example.com docker compose up -d --build
```

Caddy obtains and renews a Let's Encrypt certificate automatically.

---

## 3. Install in Stremio

1. Open `https://torrent.example.com/configure`.
2. Pick your providers, qualities, audio codecs, languages, etc.
3. Under **Debrid**, choose **RealDebrid** and paste your API token
   (get it at <https://real-debrid.com/apitoken>).
4. Click **Install in Stremio** (or **Copy URL** and paste the
   `…/manifest.json` link into Stremio → Addons → "Add addon").

---

## 4. Updating

```bash
cd Torrentio_stremio_alternative
git pull
BASE_URL=https://torrent.example.com docker compose up -d --build
```

The SQLite cache in the `torrentplus-data` volume survives updates.

---

## 5. Notes & security

- **Your install URL is sensitive.** Your RealDebrid token is encoded (base64,
  not encrypted) inside the config segment of the URL. HTTPS protects it in
  transit, but don't share your personal install link.
- **It's a public endpoint.** Anyone who knows the URL can query it. If you want
  to lock it down, add basic auth at the proxy (Caddy `basic_auth`, or a
  Cloudflare Access policy).
- **Resources.** The container is light (~512 MB RAM is plenty). The lazy cache
  grows only with what you actually watch — typically tens to hundreds of MB.
- **Firewall.** With Cloudflare Tunnel you don't need to open any inbound ports.
