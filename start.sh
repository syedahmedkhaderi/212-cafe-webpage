#!/usr/bin/env bash
#
# 212 Café — run the app.
#
#   ./start.sh          production build, then serve
#   ./start.sh dev      development server with hot reload
#   ./start.sh test     run the verification suites against the live project
#   ./start.sh reset    clear the order board and re-seed a believable demo set
#
# Assumes ./setup.sh has been run at least once.

set -euo pipefail
cd "$(dirname "$0")"

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; green=$'\033[32m'; off=$'\033[0m'
die() { printf "\n  %s✗%s %s\n\n" "$red" "$off" "$1"; exit 1; }

[ -f .env.local ] || die "No .env.local. Run ./setup.sh first."
[ -d node_modules ] || die "Dependencies are not installed. Run ./setup.sh first."

set -a; . ./.env.local; set +a
PORT="${PORT:-3000}"
MODE="${1:-prod}"

# A stale server on this port silently serves an old build — the kind of thing that
# wastes twenty minutes. Clear it before starting a new one.
#
# Only for the modes that then bind the port. This used to run unconditionally, above
# the case, which meant `./start.sh test` killed the running app and then ran suites
# against it — the browser suites and tests/headers.test.mjs all need it up.
free_port() {
  if lsof -ti:"$PORT" >/dev/null 2>&1; then
    printf "  %sPort %s is busy — stopping the existing process.%s\n" "$dim" "$PORT" "$off"
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

banner() {
  printf "\n%s  212 Café%s  %s\n" "$bold" "$off" "$1"
  printf "  %s──────────────────────────────────────────────%s\n" "$dim" "$off"
  printf "    Site        http://localhost:%s/\n" "$PORT"
  printf "    Menu        http://localhost:%s/menu\n" "$PORT"
  printf "    Dashboard   http://localhost:%s/admin\n" "$PORT"
  printf "    Kitchen     http://localhost:%s/kitchen\n" "$PORT"
  printf "    QR codes    http://localhost:%s/admin/tables\n" "$PORT"
  printf "\n    %sScan a table QR from /admin/tables to reach the ordering app.%s\n" "$dim" "$off"
  printf "    %sStaff sign-in is linked from the site footer, and is at /admin.%s\n" "$dim" "$off"
  printf "\n"
}

case "$MODE" in
  dev)
    free_port
    banner "development"
    exec npx next dev --port "$PORT"
    ;;

  test)
    printf "\n%s  Verification suites%s\n\n" "$bold" "$off"
    FAILED=0
    # headers.test.mjs needs the app running but no browser and no credentials, so it
    # belongs here rather than in the browser list below. It exits 2 to mean "skipped,
    # no server" — that is not a failure, but it is announced loudly, because a
    # regression suite that quietly never runs is worse than no suite at all.
    for suite in tests/security.test.mjs tests/staff-rls.test.mjs tests/audit-ratelimit.test.mjs tests/headers.test.mjs; do
      printf "  %s%s%s\n" "$bold" "$suite" "$off"
      rc=0; node "$suite" || rc=$?
      if [ "$rc" -eq 2 ]; then
        printf "  %s↑ skipped — see the message above.%s\n" "$dim" "$off"
      elif [ "$rc" -ne 0 ]; then
        FAILED=1
      fi
    done
    printf "\n  %sBrowser suites need the app running — start it, then:%s\n" "$dim" "$off"
    printf "    node tests/live-demo.test.mjs\n"
    printf "    node tests/rtl-availability-fidelity.test.mjs\n"
    printf "    node tests/arabic-site.test.mjs\n"
    printf "\n  %sThose place real orders. Tidy the board afterwards with ./start.sh reset.%s\n\n" "$dim" "$off"
    [ "$FAILED" -eq 0 ] || die "A suite failed."
    printf "  %s✓%s All non-browser suites passed.\n\n" "$green" "$off"
    ;;

  reset)
    printf "\n%s  Resetting the demo board%s\n\n" "$bold" "$off"
    node scripts/reset-demo-board.mjs
    printf "\n"
    ;;

  prod|*)
    free_port
    printf "\n  Building…\n"
    npm run build >/tmp/212-build.log 2>&1 || {
      tail -25 /tmp/212-build.log
      die "Build failed (full log: /tmp/212-build.log)"
    }
    printf "  %s✓%s Build complete\n" "$green" "$off"
    banner "production"
    exec npx next start --port "$PORT"
    ;;
esac
