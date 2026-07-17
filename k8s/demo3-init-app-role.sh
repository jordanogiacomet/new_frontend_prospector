#!/bin/sh
set -eu

if [ "${#DEMO3_APP_DATABASE_PASSWORD}" -lt 32 ]; then
  echo "Demo 3 runtime database password must contain at least 32 characters." >&2
  exit 1
fi

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_password="$DEMO3_APP_DATABASE_PASSWORD" <<'SQL'
CREATE ROLE prospecta_app_rw
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS
  PASSWORD :'app_password';
SQL
