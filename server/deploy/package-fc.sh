#!/usr/bin/env bash
set -euo pipefail

server_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${1:-$server_dir/../dist/penlia-fc}"
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

cp "$server_dir"/{index,http,api,core,db,im,migrate,migration-files}.mjs "$server_dir"/package{,-lock}.json "$staging/"
cp -R "$server_dir/migrations" "$staging/"
mkdir "$staging/p0"
cp "$server_dir"/p0/{access,groups,moments,routes}.mjs "$staging/p0/"
mkdir "$staging/p1"
cp "$server_dir"/p1/{routes,common,collection-access,contribution-consent,collections,enforcement-access,gatherings,moderation,rtc,wishes}.mjs "$staging/p1/"
mkdir "$staging/p2"
cp "$server_dir"/p2/{access,calendar,capsules,common,contact-cleanup,items,memories,routes,spaces,status,trips}.mjs "$staging/p2/"
mkdir "$staging/phone"
cp "$server_dir"/phone/{policy,services}.mjs "$staging/phone/"
if [[ -n "${PENLIA_RDS_CA_FILE:-}" ]]; then
  cp "$PENLIA_RDS_CA_FILE" "$staging/rds-ca.pem"
fi
npm ci --prefix "$staging" --omit=dev
(
  cd "$staging"
  zip -qr Penlia-api.zip index.mjs http.mjs api.mjs core.mjs db.mjs im.mjs migrate.mjs migration-files.mjs migrations phone p0 p1 p2 package.json package-lock.json node_modules
  if [[ -f rds-ca.pem ]]; then
    zip -q Penlia-api.zip rds-ca.pem
  fi
)
node "$server_dir/deploy/dms-migration.mjs" > "$output_dir/penlia-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --p0 > "$output_dir/penlia-p0-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --p1 > "$output_dir/penlia-p1-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --p1-followup > "$output_dir/penlia-p1-followup-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --p2 > "$output_dir/penlia-p2-dms.sql"
mv "$staging/Penlia-api.zip" "$output_dir/Penlia-api.zip"
printf '%s\n' "$output_dir/Penlia-api.zip" "$output_dir/penlia-dms.sql" "$output_dir/penlia-p0-dms.sql" "$output_dir/penlia-p1-dms.sql" "$output_dir/penlia-p1-followup-dms.sql" "$output_dir/penlia-p2-dms.sql"
