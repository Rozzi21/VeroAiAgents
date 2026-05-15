# Server Deploy Guide

Target server:

- Host: `postgresql.rozzi.my.id`
- IP: `68.183.224.98`
- PostgreSQL: already running on the same server
- Temporary OpenClaw URL: `http://postgresql.rozzi.my.id:8000/v1/responses`

## 1. Prepare Server

```bash
ssh root@68.183.224.98

apt update
apt install -y git curl build-essential
```

Install Go if it is not installed:

```bash
curl -LO https://go.dev/dl/go1.25.5.linux-amd64.tar.gz
rm -rf /usr/local/go
tar -C /usr/local -xzf go1.25.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >/etc/profile.d/go.sh
source /etc/profile.d/go.sh
go version
```

## 2. Upload Or Clone Project

Recommended path:

```bash
mkdir -p /opt/vero-travel-agents
cd /opt/vero-travel-agents
```

Clone your repo here, or upload the project folder with `rsync/scp`.

Example with rsync from local machine:

```bash
rsync -av --exclude node_modules --exclude .git \
  /media/rozzi/Data/myCode/VeroAiTravelAgents/ \
  root@68.183.224.98:/opt/vero-travel-agents/
```

## 3. Configure Backend Env

On the server:

```bash
cd /opt/vero-travel-agents/backend
cp .env.example .env
nano .env
```

Use:

```env
APP_ENV=production
PORT=8080

DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432
DATABASE_USER=vero_user
DATABASE_PASSWORD=password_aman
DATABASE_NAME=vero_travel
DATABASE_SSLMODE=disable
DATABASE_URL=

JWT_SECRET=change_this_to_a_long_random_secret

OPENCLAW_API_KEY=
OPENCLAW_BASE_URL=http://127.0.0.1:8000/v1/responses
```

Because backend, PostgreSQL, and OpenClaw are on the same server, prefer
`127.0.0.1` internally. Use `postgresql.rozzi.my.id` only when connecting from
outside the server.

## 4. Build Backend

```bash
cd /opt/vero-travel-agents/backend
go mod tidy
go build -o vero-travel-api ./cmd/server
```

Test manually:

```bash
./vero-travel-api
```

Open another terminal:

```bash
curl http://127.0.0.1:8080/health
```

## 5. Install systemd Service

```bash
cp /opt/vero-travel-agents/backend/scripts/vero-travel-api.service /etc/systemd/system/vero-travel-api.service
chown -R www-data:www-data /opt/vero-travel-agents/backend
systemctl daemon-reload
systemctl enable vero-travel-api
systemctl start vero-travel-api
systemctl status vero-travel-api
```

View logs:

```bash
journalctl -u vero-travel-api -f
```

## 6. Open Firewall

If you want public API access:

```bash
ufw allow 8080/tcp
ufw reload
```

For production, put Nginx/Caddy in front and expose HTTPS instead of opening
port `8080` directly.

## 7. OpenClaw On Same Server

If OpenClaw is already running on the server, confirm its port:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/v1/responses
```

Then set:

```env
OPENCLAW_BASE_URL=http://127.0.0.1:8000/v1/responses
```

If OpenClaw runs on another port/path, update `OPENCLAW_BASE_URL` and restart:

```bash
systemctl restart vero-travel-api
```
