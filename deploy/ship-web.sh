#!/usr/bin/env bash
# Builds the web app on this machine and swaps it in on the server, with no compiling there.
#   deploy/ship-web.sh <ssh-target> <demo-password>
set -euo pipefail
target="$1"
cd "$(dirname "$0")/.."

API_URL=http://api:4000 NEXT_PUBLIC_DEMO_MODE=true NEXT_PUBLIC_DEMO_PASSWORD="$2" \
  NEXT_OUTPUT=standalone pnpm --filter @kisht/web build

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
cp -a apps/web/.next/standalone "$out/standalone"
cp -a apps/web/.next/static "$out/static"
cp -a apps/web/public "$out/public"
cp deploy/Dockerfile.web-prebuilt "$out/Dockerfile"

tar -C "$out" -czf - . | ssh "$target" '
  set -e
  dir=$(mktemp -d)
  tar -xzf - -C "$dir"
  docker build -q -t kisht-web:latest "$dir"
  rm -rf "$dir"
  cd ~/kisht && docker compose up -d web
'
