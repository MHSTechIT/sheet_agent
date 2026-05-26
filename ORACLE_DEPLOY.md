# Oracle Cloud Always-Free deployment guide

Frontend on Vercel (free), backend on an Oracle Cloud Always-Free ARM VM
(free forever — 4 cores, 24 GB RAM total across up to 4 VMs). Reliable 24/7,
real persistent disk, no spin-down, no $7/mo Render bill.

**Total cost: $0/month**, after a one-time credit-card verification on
Oracle's side (they don't charge it as long as you stay in the Always-Free
shape).

> ⏱ Expected setup time: ~30 minutes (mostly waiting for Oracle's provisioner).

---

## Phase 1 — Sign up for Oracle Cloud (5 min)

1. Go to https://signup.cloud.oracle.com.
2. Click **Start for free** → fill in email, country, password.
3. **Home region** — pick something close to you:
   - India? → **Mumbai** or **Hyderabad**
   - Singapore? → **Singapore**
   - US? → **Phoenix** or **Ashburn**
   - 🚨 **You can't change this later**, so choose carefully.
4. **Verify mobile** → SMS code.
5. **Verify credit card** — Oracle puts a $1 hold and refunds it. Use a real
   card (debit works). Without this verification you can't create VMs.
6. **Tenancy name** — pick anything; you won't see it often.
7. Wait 5-10 minutes for the tenancy to provision. You'll get an email when ready.

---

## Phase 2 — Create the Always-Free ARM VM (5 min)

1. Sign in to https://cloud.oracle.com.
2. Top-left **☰ Menu** → **Compute** → **Instances**.
3. Click **Create instance**.
4. Fill in:
   - **Name:** `sheet-agent`
   - **Compartment:** leave default (your tenancy root)
   - **Image and shape:**
     - Click **Edit** next to **Image** → choose **Canonical Ubuntu 22.04**
     - Click **Edit** next to **Shape** → click **Ampere** tab → **VM.Standard.A1.Flex**
     - Set **OCPUs** = **4**, **Memory** = **24 GB** (you can use less, but Always-Free is up to these)
   - **Primary VNIC info:**
     - Leave defaults (Oracle creates a VCN with public subnet)
     - ☑ **Assign a public IPv4 address** (must be checked)
   - **Add SSH keys:**
     - **Generate a key pair for me** → click **Save Private Key** (downloads `.key` file) AND **Save Public Key**
     - 🚨 Keep that downloaded `.key` file safe — it's the only way to SSH in
5. Scroll down → **Create**.
6. Wait 30-60 seconds. When the instance turns **Running**, copy its **Public IP address** (top of the page).

---

## Phase 3 — Open ports in the Virtual Cloud Network (3 min)

By default Oracle's VCN blocks all inbound traffic except SSH (port 22). You need to open 80 (HTTP) and 443 (HTTPS):

1. ☰ Menu → **Networking** → **Virtual cloud networks**.
2. Click your VCN (the one Oracle auto-created — name like `vcn-2026...`).
3. Click **Public Subnet-...**.
4. Click **Default Security List for vcn-...**.
5. **Ingress Rules** → **Add Ingress Rules**:
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** TCP
   - **Destination Port Range:** `80`
   - Click **+ Another Ingress Rule**
   - **Source CIDR:** `0.0.0.0/0`, **TCP**, **Port 443**
   - **Add Ingress Rules**

---

## Phase 4 — SSH into the VM (2 min)

On Windows:

```powershell
# Move the downloaded key somewhere safe and lock down its permissions
icacls C:\path\to\ssh-key-2026.key /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Connect
ssh -i C:\path\to\ssh-key-2026.key ubuntu@<your-public-ip>
```

On Mac/Linux:

```bash
chmod 400 ~/Downloads/ssh-key-2026.key
ssh -i ~/Downloads/ssh-key-2026.key ubuntu@<your-public-ip>
```

You should land at `ubuntu@sheet-agent:~$`.

---

## Phase 5 — Bootstrap the VM (5 min)

Run the one-shot setup script:

```bash
curl -fsSL https://raw.githubusercontent.com/hariharanannamalairaman-cell/sheet-agent/main/deploy/oracle-setup.sh | bash
```

This installs Node 20, pnpm, PM2, Caddy, and opens the firewall. Takes 3-5 minutes.

---

## Phase 6 — Clone + configure + start (5 min)

```bash
cd ~
git clone https://github.com/hariharanannamalairaman-cell/sheet-agent.git
cd sheet-agent

# Copy the example env and fill in your secrets
cp .env.example .env
nano .env
# Paste every value from your local .env. Save with Ctrl+O, Enter, Ctrl+X.

# Build the API
pnpm install --frozen-lockfile
pnpm --filter @sheet-agent/api build

# Start under PM2 (auto-restart on crash + reboot)
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
# ← PM2 prints a `sudo ...` command. Copy it and run it. This makes PM2
#   start automatically when the VM reboots.
```

Sanity check:

```bash
curl http://localhost:4000/auth/me
# Should print: {"message":"Unauthorized","statusCode":401}
```

You should also see a 🟢 startup ping in your Telegram bot.

---

## Phase 7 — Set up HTTPS reverse proxy (5 min)

You need a domain (or a free DuckDNS / sslip.io subdomain). For zero-config testing, **sslip.io** works:

- `<your-public-ip>.sslip.io` resolves to your IP automatically. No DNS setup.

Configure Caddy:

```bash
sudo nano /etc/caddy/Caddyfile
```

Paste this (replace `<your-ip>` with your VM's public IP, e.g. `123.45.67.89`):

```
<your-ip>.sslip.io {
    reverse_proxy localhost:4000
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000"
        -Server
    }
}
```

Save (`Ctrl+O`, `Enter`, `Ctrl+X`), then:

```bash
sudo systemctl restart caddy
sudo systemctl enable caddy
```

Wait ~30 seconds for Caddy to fetch a Let's Encrypt certificate, then verify:

```bash
curl https://<your-ip>.sslip.io/auth/me
# Should print: {"message":"Unauthorized","statusCode":401}
```

Your backend is now live at **`https://<your-ip>.sslip.io`**.

If you have a real domain (e.g. `api.example.com`):

1. In your DNS provider, add an **A record** for `api.example.com` → your VM's public IP.
2. Replace `<your-ip>.sslip.io` in the Caddyfile with `api.example.com`.
3. `sudo systemctl restart caddy`.

---

## Phase 8 — Deploy the frontend on Vercel (5 min)

This is identical to the Vercel section in [DEPLOY.md](DEPLOY.md), with one change:

In Vercel **Environment Variables**:

```
NEXT_PUBLIC_API_URL    https://<your-ip>.sslip.io          ← your Oracle HTTPS URL
NEXTAUTH_URL           https://your-app.vercel.app          ← updated after deploy
NEXTAUTH_SECRET        (same as your .env)
```

Then on the Oracle VM, update `.env`:

```bash
nano ~/sheet-agent/.env
# Set WEB_ORIGIN=https://your-app.vercel.app
pm2 restart sheet-agent-api
```

---

## Phase 9 — Verify end-to-end (2 min)

1. Open your Vercel URL → log in with `admin123`.
2. Dashboard should load with **your existing flows** (we did NOT git-ignore `data/` migrations on the VM — they're recreated from scratch the first time).
3. Click **Validate** → all three integrations should turn green.
4. Telegram should already show a 🟢 startup ping.

Done.

---

## Operating the deployment

### View live logs

```bash
pm2 logs sheet-agent-api
# Ctrl+C to exit
```

### Restart after .env change

```bash
pm2 restart sheet-agent-api
```

### Pull latest code from GitHub

```bash
cd ~/sheet-agent
git pull
pnpm install --frozen-lockfile
pnpm --filter @sheet-agent/api build
pm2 restart sheet-agent-api
```

### Back up data

Your `data/` directory contains all flows + lead-dedup state. To back it up:

```bash
cd ~/sheet-agent/backend
tar -czf ~/sheet-agent-backup-$(date +%F).tar.gz data/
```

Or scp it to your local machine periodically.

### Server health

```bash
pm2 status                    # is the process up?
pm2 monit                     # live CPU + RAM monitoring
free -m                       # system memory
df -h                         # disk space
sudo systemctl status caddy   # is the reverse proxy healthy?
```

---

## If something breaks

| Symptom | Check |
|---|---|
| Vercel app → "Network error" / CORS | `pm2 logs` for errors. Confirm `WEB_ORIGIN` env on VM matches your Vercel URL exactly. `pm2 restart` after changes. |
| HTTPS cert keeps failing | Confirm DNS A record points at the VM IP. Confirm port 80 is open (Caddy uses port 80 for the ACME challenge). |
| API returns 502 / connection refused via Caddy | API isn't running. `pm2 status` → if stopped, `pm2 restart sheet-agent-api`. Check `pm2 logs sheet-agent-api` for crash reason. |
| Telegram alerts stopped | `pm2 logs` for "Telegram send failed" entries. Usually network blip; auto-recovers. |
| VM rebooted, API didn't come back | You didn't run `pm2 startup` + the sudo command it printed. Run them now. |

---

## Cost confirmation

Oracle Always-Free **never** charges you for staying within these limits:

- 4 ARM cores + 24 GB RAM (sum across up to 4 VMs)
- 200 GB block storage
- 10 TB outbound bandwidth per month
- 1 Load Balancer (10 Mbps)
- 2 Object Storage buckets

Your sheet-agent VM uses maybe 1 GB disk and < 1 GB RAM. You're using ~5% of free quota.

To **stay** free, do NOT upgrade your account to "paid tier" in the console even if Oracle nudges you. As long as you stay on the Always-Free Trial card, you can't be charged.
