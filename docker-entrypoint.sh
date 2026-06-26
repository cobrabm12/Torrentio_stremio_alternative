#!/bin/sh
# Ensure the persistent data directory is writable by the unprivileged `node`
# user, then drop privileges. This makes the same image work with Docker named
# volumes, bind mounts, and Fly.io volumes (which are created root-owned).
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR" 2>/dev/null || true

exec gosu node "$@"
