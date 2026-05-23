#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DB_USER="${DATABASE_USER:-vero_user}"
DB_PASS="${DATABASE_PASSWORD:-password_aman}"
DB_NAME="${DATABASE_NAME:-vero_travel}"
DB_PORT="${DATABASE_PORT:-5432}"

log() { printf '==> %s\n' "$*"; }
warn() { printf '!! %s\n' "$*" >&2; }

docker_ready() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

wait_for_postgres() {
  local host="$1"
  local attempts=30
  local i=1

  log "Menunggu PostgreSQL siap di ${host}:${DB_PORT}..."
  while [ "$i" -le "$attempts" ]; do
    if command -v pg_isready >/dev/null 2>&1; then
      if pg_isready -h "$host" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        log "PostgreSQL siap."
        return 0
      fi
    elif docker exec vero-travel-postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      log "PostgreSQL siap (container)."
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done

  warn "PostgreSQL belum merespons setelah ${attempts} percobaan."
  return 1
}

setup_with_docker() {
  log "Menjalankan PostgreSQL via Docker Compose..."
  docker compose up postgres -d
  wait_for_postgres "localhost"
}

setup_native() {
  log "Menginstal PostgreSQL native (Debian/Ubuntu)..."
  sudo apt-get update
  sudo apt-get install -y postgresql postgresql-contrib

  log "Membuat user dan database..."
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

  wait_for_postgres "localhost"
}

print_docker_permission_help() {
  warn "Docker terdeteksi, tapi akun ini belum punya akses ke Docker socket."
  cat <<'EOF'

Perbaiki dengan salah satu cara berikut:

  1) Tambahkan user ke grup docker (disarankan), lalu login ulang:
       sudo usermod -aG docker "$USER"
       # logout/login, atau jalankan: newgrp docker

  2) Jalankan script ini lagi setelah langkah di atas:
       ./scripts/setup-postgres.sh --docker

  3) Atau pakai PostgreSQL native:
       ./scripts/setup-postgres.sh --native

EOF
}

MODE="${1:-auto}"

case "$MODE" in
  --docker)
    if docker_ready; then
      setup_with_docker
    else
      print_docker_permission_help
      exit 1
    fi
    ;;
  --native)
    setup_native
    ;;
  auto)
    if docker_ready; then
      setup_with_docker
    elif command -v docker >/dev/null 2>&1; then
      print_docker_permission_help
      exit 1
    else
      warn "Docker tidak ditemukan. Beralih ke instalasi native..."
      setup_native
    fi
    ;;
  *)
    echo "Usage: $0 [--docker|--native|auto]"
    exit 1
    ;;
esac

cat <<EOF

PostgreSQL lokal siap dipakai.

  Host     : localhost
  Port     : ${DB_PORT}
  Database : ${DB_NAME}
  User     : ${DB_USER}
  Password : ${DB_PASS}

Jalankan backend:
  cd ${ROOT_DIR}
  go run ./cmd/server

EOF
