#!/usr/bin/env bash
# Validates the Supabase migrations + RLS policies against a throwaway local
# Postgres cluster (no Supabase project or Docker required).
# Usage: npm run db:verify   (requires Postgres binaries, e.g. /usr/lib/postgresql/16/bin)
set -euo pipefail

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [[ -z "${PG_BIN}" || ! -x "${PG_BIN}/initdb" ]]; then
  echo "Postgres binaries not found. Set PG_BIN to the directory containing initdb." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
PORT="${PGPORT_VERIFY:-54329}"
RUN_AS=()
if [[ "$(id -u)" == "0" ]]; then
  # initdb refuses to run as root; use the postgres system user when available.
  chown -R postgres "$TMP" 2>/dev/null || true
  RUN_AS=(runuser -u postgres --)
fi

cleanup() { "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$TMP/data" -U postgres --auth=trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$TMP" -p "$PORT" -U postgres -d postgres)
"${PSQL[@]}" -f "$ROOT/supabase/tests/local_auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "Applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql"
