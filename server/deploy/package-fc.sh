#!/usr/bin/env bash
set -euo pipefail

server_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${1:-$server_dir/../dist/penlia-fc}"
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

cp "$server_dir"/{index,api,db,im,migrate,migration-files}.mjs "$server_dir"/package{,-lock}.json "$staging/"
cp -R "$server_dir/migrations" "$staging/"
if [[ -n "${PENLIA_RDS_CA_FILE:-}" ]]; then
  cp "$PENLIA_RDS_CA_FILE" "$staging/rds-ca.pem"
fi
npm ci --prefix "$staging" --omit=dev
(
  cd "$staging"
  zip -qr Penlia-api.zip index.mjs api.mjs db.mjs im.mjs migrate.mjs migration-files.mjs migrations package.json package-lock.json node_modules
  if [[ -f rds-ca.pem ]]; then
    zip -q Penlia-api.zip rds-ca.pem
  fi
)
node "$server_dir/deploy/dms-migration.mjs" > "$output_dir/penlia-dms.sql"
mv "$staging/Penlia-api.zip" "$output_dir/Penlia-api.zip"
printf '%s\n' "$output_dir/Penlia-api.zip" "$output_dir/penlia-dms.sql"
