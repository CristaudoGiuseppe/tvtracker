## TVTracker

A self-hosted TV/movie tracker (Next.js + SQLite) that runs on your own machine via Docker, with a permanent local data volume. It talks to TMDB for metadata and search.

### Prerequisites

- Docker Desktop (macOS/Windows) or Docker Engine + Compose (Linux)
- A [TMDB](https://www.themoviedb.org/settings/api) account with an API key (v3) and a Read Access Token (v4)

### Setup

1. Copy the env template and fill in your TMDB credentials:

   ```bash
   cp .env.example .env
   # edit .env and set TMDB_API_KEY and TMDB_READ_TOKEN
   ```

   Leave `DATA_DIR=./data` in `.env` — that value is only used by `npm run dev`. In Docker, `docker-compose.yml` pins `DATA_DIR=/data` (the in-container mount point) regardless of what's in `.env`.

2. Build and start the container:

   ```bash
   docker compose up -d --build
   ```

3. Open [http://localhost:3000](http://localhost:3000).

4. Go to **Settings → Import** to bring in an existing TV Time export, or use **Explore** to search TMDB and start adding shows/movies directly.

### Where your data lives

The SQLite database is written to `./data/tvtracker.db` on your host machine (bind-mounted into the container at `/data`). This directory is what makes your library, ratings, and watch history permanent across container restarts, rebuilds, and even reinstalls — as long as `./data` isn't deleted, your data is safe.

### Backup

Just copy the `data` directory while the app isn't mid-write (a quick `docker compose stop` first is the safest option, though SQLite's WAL mode makes this low-risk even while running):

```bash
docker compose stop
cp -r data data-backup-$(date +%Y%m%d)
docker compose start
```

### Restore

```bash
docker compose down
rm -rf data
cp -r data-backup-YYYYMMDD data
docker compose up -d
```

### Update to a new version

```bash
git pull
docker compose build
docker compose up -d
```

Your `./data` directory is untouched by rebuilds — schema migrations (if any) run automatically at startup.

### Uninstall

```bash
docker compose down
```

This stops and removes the container. Delete the `./data` directory only if you want to permanently erase your library.

### Local development (no Docker)

```bash
npm install
npm run dev
```

Uses `.env` directly (`DATA_DIR=./data`, same TMDB credentials). Requires Node.js 22+.

### Notes on permissions

The container runs as the non-root `node` user (uid 1000) baked into the `node:22-slim` base image. On Docker Desktop for macOS/Windows, the bind-mount file-sharing layer maps host permissions loosely, so this works out of the box. On native Linux hosts, if you hit a permission error writing to `./data`, run `sudo chown -R 1000:1000 ./data` once.

---

## Guida rapida (Italiano)

1. Copia `.env.example` in `.env` e inserisci le tue chiavi TMDB (`TMDB_API_KEY`, `TMDB_READ_TOKEN`). Lascia `DATA_DIR=./data` invariato.
2. Avvia tutto con:
   ```bash
   docker compose up -d --build
   ```
3. Apri [http://localhost:3000](http://localhost:3000).
4. Usa **Settings → Import** per importare un export da TV Time, oppure **Explore** per cercare e aggiungere serie/film.

**Backup**: copia la cartella `data` (contiene il database SQLite — è tutta la tua libreria).
**Ripristino**: sostituisci `data` con una copia di backup, poi `docker compose up -d`.
**Aggiornamento**: `git pull && docker compose build && docker compose up -d`.
**Sviluppo locale**: `npm install && npm run dev`.
