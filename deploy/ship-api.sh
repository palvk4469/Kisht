#!/usr/bin/env bash
# Swaps new API code into the server's image, with no install or compiling there. Only for
# code changes: new dependencies or a schema change need the full build in deployment.md.
#   deploy/ship-api.sh <ssh-target>
set -euo pipefail
target="$1"
cd "$(dirname "$0")/.."

tar -czf - --exclude=generated apps/api/src packages/domain/src packages/contracts/src packages/db/src |
  ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "$target" '
    set -e
    dir=$(mktemp -d)
    tar -xzf - -C "$dir"
    printf "FROM kisht-api:latest\nCOPY . /repo/\n" > "$dir/Dockerfile"
    docker build -q -t kisht-api:latest "$dir"
    rm -rf "$dir"
    cd ~/kisht && docker compose up -d api
  '
