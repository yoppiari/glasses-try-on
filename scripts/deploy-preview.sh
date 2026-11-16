#!/usr/bin/env bash
# Deploy preview Try-On ke sandbox Fural (https://glasses-try-on-pocco.fural.space).
#
#   scripts/deploy-preview.sh
#
# - npm test + build (Vite) → folder rilis ~/deploy/glasses-try-on (dist/ + server/) → `fural-agent sandboxes serve`.
# - Server: node server/serve.mjs (tanpa dependensi, tanpa data member). Data member ada di DOOZ CRM.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REL="${TRYON_RELEASE_DIR:-$HOME/deploy/glasses-try-on}"
PROJECT="${DOOZ_PROJECT_ID:-PJ4ba10f2d1258fcd1e0e7662e}"
CRM_URL="${CRM_URL:-https://dooz-crm-pocco.fural.space}"
UKUR_URL="${UKUR_URL:-https://ukur-frame-dooz-pocco.fural.space}"

(cd "$ROOT" && npm ci --no-audit --no-fund >/dev/null && npm test >/dev/null && npm run build >/dev/null)

mkdir -p "$REL"
rm -rf "$REL/dist" "$REL/server" "$REL/customer-hub" "$REL/data"
cp -r "$ROOT/dist" "$REL/dist"
mkdir -p "$REL/server"
cp "$ROOT/server/serve.mjs" "$ROOT/server/redirects.mjs" "$REL/server/"

fural-agent sandboxes serve --name glasses-try-on --slug glasses-try-on --project "$PROJECT" --dir "$REL" \
  --cmd "CRM_URL=$CRM_URL UKUR_URL=$UKUR_URL PORT=3000 exec node server/serve.mjs dist" --port 3000
