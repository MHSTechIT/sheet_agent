#!/usr/bin/env bash
# Oracle Cloud Always-Free VM bootstrap.
# Run as the default user (`ubuntu` for Ubuntu, `opc` for Oracle Linux).
# Tested on Oracle Linux 8 / Ubuntu 22.04 ARM (Ampere A1).

set -euo pipefail

echo "==> Updating OS packages"
if command -v dnf &>/dev/null; then
  sudo dnf update -y
  sudo dnf install -y git curl tar make gcc-c++ python3 firewalld
elif command -v apt-get &>/dev/null; then
  sudo apt-get update -y
  sudo apt-get upgrade -y
  sudo apt-get install -y git curl tar build-essential python3 ufw
fi

echo "==> Installing Node.js 20 LTS (via NodeSource)"
if ! command -v node &>/dev/null || [[ $(node -v) != v20* ]]; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x 2>/dev/null | sudo bash - || \
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  if command -v dnf &>/dev/null; then
    sudo dnf install -y nodejs
  else
    sudo apt-get install -y nodejs
  fi
fi
echo "    node: $(node -v)"
echo "    npm:  $(npm -v)"

echo "==> Installing pnpm globally"
sudo npm install -g pnpm pm2

echo "==> Installing Caddy 2 (reverse proxy with auto-HTTPS)"
if ! command -v caddy &>/dev/null; then
  if command -v dnf &>/dev/null; then
    sudo dnf install -y 'dnf-command(copr)'
    sudo dnf copr enable -y @caddy/caddy
    sudo dnf install -y caddy
  else
    sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt-get update -y
    sudo apt-get install -y caddy
  fi
fi

echo "==> Opening firewall ports 80 + 443 (HTTP / HTTPS)"
if command -v firewall-cmd &>/dev/null; then
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --reload
  # iptables fallback on Oracle Linux
  sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT || true
  sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT || true
  sudo bash -c "iptables-save > /etc/iptables/rules.v4" || true
elif command -v ufw &>/dev/null; then
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
fi

echo "==> Done. Next steps:"
echo "  1. git clone https://github.com/hariharanannamalairaman-cell/sheet-agent.git"
echo "  2. cd sheet-agent"
echo "  3. cp .env.example .env  &&  edit .env  (paste your secrets)"
echo "  4. pnpm install"
echo "  5. pnpm --filter @sheet-agent/api build"
echo "  6. pm2 start deploy/ecosystem.config.cjs"
echo "  7. pm2 save  &&  pm2 startup  (run the sudo cmd it prints)"
echo "  8. sudo cp deploy/Caddyfile /etc/caddy/Caddyfile  (edit domain first)"
echo "  9. sudo systemctl restart caddy"
