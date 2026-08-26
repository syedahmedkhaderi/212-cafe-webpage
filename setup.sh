#!/usr/bin/env bash
#
# 212 Café — one-shot setup.
#
#   ./setup.sh
#
# Installs dependencies, creates .env.local if missing, then checks that the
# Supabase project behind it is actually reachable and seeded. Safe to re-run.

set -euo pipefail
cd "$(dirname "$0")"

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; green=$'\033[32m'; yellow=$'\033[33m'; off=$'\033[0m'
step() { printf "\n%s▸ %s%s\n" "$bold" "$1" "$off"; }
ok()   { printf "  %s✓%s %s\n" "$green" "$off" "$1"; }
warn() { printf "  %s!%s %s\n" "$yellow" "$off" "$1"; }
die()  { printf "  %s✗%s %s\n" "$red" "$off" "$1"; exit 1; }

# ---------------------------------------------------------------- prerequisites
step "Checking prerequisites"

command -v node >/dev/null 2>&1 || die "Node.js is not installed. Install Node 20 or newer: https://nodejs.org"

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) is too old. This project needs Node 20+."
ok "Node $(node -v)"

command -v npm >/dev/null 2>&1 || die "npm is not installed."
ok "npm $(npm -v)"

# ------------------------------------------------------------------ environment
step "Environment"

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  warn "Created .env.local from .env.example — fill it in before the app will run:"
  printf "      %s\n" \
    "NEXT_PUBLIC_SUPABASE_URL      your project URL" \
    "NEXT_PUBLIC_SUPABASE_ANON_KEY the publishable key (safe to expose)" \
    "NEXT_PUBLIC_SITE_URL          the origin QR codes point at"
  printf "\n  %sBoth keys are on the Supabase dashboard under Settings → API.%s\n" "$dim" "$off"
  NEEDS_ENV=1
else
  ok ".env.local present"
fi

set -a; . ./.env.local 2>/dev/null || true; set +a

MISSING=""
for var in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
  [ -n "${!var:-}" ] || MISSING="$MISSING $var"
done
[ -z "$MISSING" ] || die "Missing in .env.local:$MISSING"

if [ -z "${NEXT_PUBLIC_SITE_URL:-}" ]; then
  warn "NEXT_PUBLIC_SITE_URL is unset — defaulting to http://localhost:3000."
  warn "Set it to the deployed origin BEFORE printing any table QR codes."
else
  ok "Site origin: $NEXT_PUBLIC_SITE_URL"
  case "$NEXT_PUBLIC_SITE_URL" in
    http://localhost*|http://127.0.0.1*)
      warn "Origin is local — QR codes printed now will not work from a phone." ;;
  esac
fi

# ---------------------------------------------------------------- dependencies
step "Installing dependencies"
if [ -f package-lock.json ]; then
  npm ci --silent 2>/dev/null || npm install --silent
else
  npm install --silent
fi
ok "$(node -p "Object.keys(require('./package.json').dependencies).length") runtime packages installed"

# ------------------------------------------------------------------- database
step "Checking the database"

node --input-type=module <<'NODE'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const green = '\x1b[32m', yellow = '\x1b[33m', red = '\x1b[31m', off = '\x1b[0m';
const ok = (m) => console.log(`  ${green}✓${off} ${m}`);
const warn = (m) => console.log(`  ${yellow}!${off} ${m}`);

const get = async (path) => {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json();
};

try {
  const items = await get('menu_items?select=id&limit=200');
  const cats = await get('menu_categories?select=id');

  if (items.length === 0) {
    warn('Connected, but the menu is empty.');
    console.log(`
  Apply the migrations in supabase/migrations/ in filename order.
  Either paste them into the Supabase SQL editor, or with the CLI:

      supabase link --project-ref <your-ref>
      supabase db push
`);
    process.exit(0);
  }

  ok(`Connected — ${items.length} menu items across ${cats.length} categories`);

  // RLS smoke test: the anon key must not be able to read orders.
  const orders = await get('orders?select=id&limit=1');
  if (orders.length === 0) ok('RLS holding — anon cannot read orders');
  else console.log(`  ${red}✗${off} RLS PROBLEM: anon can read orders. Do not deploy.`);
} catch (e) {
  console.log(`  ${red}✗${off} Could not reach Supabase: ${e.message}`);
  console.log('    Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}
NODE

# ------------------------------------------------------------------------ done
step "Ready"
if [ -n "${NEEDS_ENV:-}" ]; then
  printf "  Fill in .env.local, then run %s./setup.sh%s again.\n" "$bold" "$off"
else
  printf "  Start the app with %s./start.sh%s      (development: %s./start.sh dev%s)\n" "$bold" "$off" "$bold" "$off"
fi
printf "\n"
