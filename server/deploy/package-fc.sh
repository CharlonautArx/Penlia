#!/usr/bin/env bash
set -euo pipefail

server_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${1:-$server_dir/../dist/penlia-fc}"
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

cp "$server_dir"/{index,http,api,core,db,im,security,migrate,migration-files}.mjs "$server_dir"/package{,-lock}.json "$staging/"
mkdir "$staging/migrations"
find "$server_dir/migrations" -maxdepth 1 -type f -name '[0-9]*_*.sql' -exec cp {} "$staging/migrations/" \;
for area in p0 p1 p2 p3 phone; do
  mkdir "$staging/$area"
  find "$server_dir/$area" -maxdepth 1 -type f -name '*.mjs' ! -name '*.test.mjs' \
    -exec cp {} "$staging/$area/" \;
done
if [[ -n "${PENLIA_RDS_CA_FILE:-}" ]]; then
  # Reject appended private keys, comments with credentials, and non-certificate input.
  awk '
    /^-----BEGIN CERTIFICATE-----\r?$/ && !inside { inside=1; seen++; next }
    /^-----END CERTIFICATE-----\r?$/ && inside { inside=0; next }
    inside && /^[A-Za-z0-9+\/=]+\r?$/ { next }
    !inside && /^[[:space:]]*$/ { next }
    { exit 1 }
    END { if (inside || !seen) exit 1 }
  ' "$PENLIA_RDS_CA_FILE"
  openssl crl2pkcs7 -nocrl -certfile "$PENLIA_RDS_CA_FILE" -out /dev/null 2>/dev/null
  cp "$PENLIA_RDS_CA_FILE" "$staging/rds-ca.pem"
fi
npm ci --prefix "$staging" --omit=dev --ignore-scripts
(
  cd "$staging"
  zip -qr Penlia-api.zip index.mjs http.mjs api.mjs core.mjs db.mjs im.mjs security.mjs migrate.mjs migration-files.mjs migrations phone p0 p1 p2 p3 package.json package-lock.json node_modules
  if [[ -f rds-ca.pem ]]; then
    zip -q Penlia-api.zip rds-ca.pem
  fi
)
node "$server_dir/deploy/dms-migration.mjs" > "$output_dir/penlia-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --p0 > "$output_dir/penlia-p0-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --p1 > "$output_dir/penlia-p1-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --p1-followup > "$output_dir/penlia-p1-followup-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --p2 > "$output_dir/penlia-p2-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --p2-followup > "$output_dir/penlia-p2-followup-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --p3 > "$output_dir/penlia-p3-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --friend-profile-covers > "$output_dir/penlia-friend-profile-covers-dms.sql"
node "$server_dir/deploy/dms-migration.mjs" --moment-interactions > "$output_dir/penlia-moment-interactions-dms.sql"
mv "$staging/Penlia-api.zip" "$output_dir/Penlia-api.zip"
printf '%s\n' "$output_dir/Penlia-api.zip" "$output_dir/penlia-dms.sql" "$output_dir/penlia-p0-dms.sql" "$output_dir/penlia-p1-dms.sql" "$output_dir/penlia-p1-followup-dms.sql" "$output_dir/penlia-p2-dms.sql" "$output_dir/penlia-p2-followup-dms.sql" "$output_dir/penlia-p3-dms.sql" "$output_dir/penlia-friend-profile-covers-dms.sql" "$output_dir/penlia-moment-interactions-dms.sql"
