#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

status=0

if command -v rg >/dev/null 2>&1; then
  has_rg=1
else
  has_rg=0
  echo "[warn] rg command not found; using grep fallback where possible"
fi

check_required_file() {
  local path="$1"
  if [ -f "$path" ]; then
    echo "[ok] $path"
  else
    echo "[missing] $path"
    status=1
  fi
}

check_absent_file() {
  local path="$1"
  if [ -e "$path" ]; then
    echo "[failed] unexpected stale file present: $path"
    status=1
  else
    echo "[ok] stale file not present: $path"
  fi
}

echo "Checking required docs..."
check_required_file README.md
check_required_file LICENSE
check_required_file THIRD_PARTY_NOTICES.md
check_required_file docs/DISTRIBUTION.md
check_required_file docs/RELEASE_RUNBOOK.md
check_required_file docs/PUBLICATION_RUNBOOK.md
check_required_file docs/setup_guide.md
check_required_file docs/CONFIG_REFERENCE.md
check_required_file docs/GOOGLE_DOCS_MARKDOWN_PROFILE.md
check_required_file docs/SETUP_PDF.md
check_required_file docs/AUTH_MODEL.md
check_required_file docs/API_EXPOSURE_AUDIT.md
check_required_file docs/ASSET_RIGHTS_MANIFEST.md
check_required_file docs/KNOWN_LIMITATIONS.md
check_required_file docs/AUDIT_REPORT.md
check_required_file docs/IMPROVEMENT_PLAN.md
check_required_file docs/PUBLIC_RELEASE_CHECKLIST.md
check_required_file docs/PR_DESCRIPTION.md
check_required_file docs/TROUBLESHOOTING.md
check_required_file CONTENT_LICENSE.md
check_required_file SECURITY.md
check_required_file CONTRIBUTING.md
check_required_file public_manifest.txt
check_required_file exclude_manifest.txt
check_required_file scripts/create_public_import.sh
check_required_file licenses/OFL-1.1-BIZ-FONTS.txt
check_required_file .bgproject.json
check_absent_file docs/reviw0510.md

echo
echo "Checking production hardening configuration..."
check_required_file api/services/runtime_config.py
check_required_file api/services/upload_validation.py
if grep -q '^APP_ENV=production$' .env.prod.example; then
  echo "[ok] .env.prod.example sets APP_ENV=production"
else
  echo "[failed] .env.prod.example must set APP_ENV=production"
  status=1
fi
if grep -q '^GOOGLE_CREDENTIALS_DIR=' .env.prod.example; then
  echo "[ok] .env.prod.example documents GOOGLE_CREDENTIALS_DIR"
else
  echo "[failed] .env.prod.example must document GOOGLE_CREDENTIALS_DIR"
  status=1
fi
if grep -qE '^(ADMIN_SECRET|SESSION_SECRET)=.+$' .env.prod.example; then
  echo "[failed] .env.prod.example must not include runnable ADMIN_SECRET or SESSION_SECRET values"
  status=1
else
  echo "[ok] .env.prod.example leaves production secrets empty"
fi
if grep -q '^ENABLE_RAW_CONFIG_EDITOR=false$' .env.prod.example; then
  echo "[ok] raw config editor defaults off in production env example"
else
  echo "[failed] .env.prod.example must set ENABLE_RAW_CONFIG_EDITOR=false"
  status=1
fi
if grep -q '^AUTH_BYPASS_ENABLED=true$' .env.prod.example; then
  echo "[failed] .env.prod.example must not enable AUTH_BYPASS_ENABLED"
  status=1
else
  echo "[ok] .env.prod.example does not enable auth bypass"
fi
if grep -q '127.0.0.1:8000:8000' docker-compose.yml && grep -q '127.0.0.1:5173:5173' docker-compose.yml; then
  echo "[ok] development compose ports are loopback-bound"
else
  echo "[failed] docker-compose.yml must bind API/UI ports to 127.0.0.1"
  status=1
fi
if grep -q 'ALLOWED_ORIGINS:.*:?Set ALLOWED_ORIGINS' docker-compose.prod.yml; then
  echo "[ok] production compose requires explicit ALLOWED_ORIGINS"
else
  echo "[failed] docker-compose.prod.yml must require explicit ALLOWED_ORIGINS"
  status=1
fi
if grep -q 'ENABLE_RAW_CONFIG_EDITOR.*false' docker-compose.prod.yml; then
  echo "[ok] production compose defaults raw config editor off"
else
  echo "[failed] docker-compose.prod.yml must default ENABLE_RAW_CONFIG_EDITOR to false"
  status=1
fi
if grep -q 'sha256sum -c -' docker/Dockerfile.api && grep -q 'sha256sum -c -' docker/Dockerfile.api-pdf; then
  echo "[ok] API Dockerfiles verify Quarto package checksums"
else
  echo "[failed] docker/Dockerfile.api and docker/Dockerfile.api-pdf must verify Quarto .deb checksums"
  status=1
fi
if grep -q 'npm ci || npm install' docker/Dockerfile.ui; then
  echo "[failed] docker/Dockerfile.ui must not fall back from npm ci to npm install"
  status=1
else
  echo "[ok] docker/Dockerfile.ui uses npm ci without install fallback"
fi
if grep -q 'syncChapter' ui-next/src/lib/api.ts; then
  echo "[failed] ui-next/src/lib/api.ts still exposes deprecated syncChapter wrapper"
  status=1
else
  echo "[ok] deprecated syncChapter wrapper absent from ui-next/src/lib/api.ts"
fi
if grep -n 'allowed_suffixes=.*svg\|ALLOWED_IMAGE_SUFFIXES.*svg\|image/svg' api/routers/project.py api/services/file_safety.py api/services/upload_validation.py >/tmp/ajmun_release_check_svg_upload.log 2>&1; then
  echo "[failed] SVG upload allowance appears to remain"
  cat /tmp/ajmun_release_check_svg_upload.log
  status=1
else
  echo "[ok] SVG upload allowance not detected in upload path"
fi
if grep -q 'access_token: str' api/routers/auth.py || grep -q 'return TokenResponse' api/routers/auth.py; then
  echo "[failed] Google OAuth token endpoints must not expose access_token/refresh_token response models"
  status=1
else
  echo "[ok] Google OAuth token endpoints return status only"
fi
if grep -q 'token_urlsafe' api/routers/auth.py \
  && grep -q 'google_oauth_state' api/routers/auth.py \
  && grep -q 'compare_digest' api/routers/auth.py \
  && grep -q 'state=state' api/services/google_auth.py \
  && grep -q 'exchangeToken(code, redirectUri, state)' ui-next/src/features/auth/AuthCallback.tsx; then
  echo "[ok] Google OAuth state is generated, verified, and passed by the callback"
else
  echo "[failed] Google OAuth state generation/verification/callback wiring is incomplete"
  status=1
fi
if grep -q '/tmp/ajmun-bg-editor/texmf-var' api/services/build_runner.py \
  && grep -q 'Path("/tmp").resolve()' api/services/build_runner.py \
  && grep -q '/tmp/ajmun-bg-editor' api/services/build_runner.py \
  && grep -q 'BUILD_COMMAND_TIMEOUT_SECONDS' api/services/build_runner.py; then
  echo "[ok] BuildRunner uses a scoped tmp root and command timeout"
else
  echo "[failed] BuildRunner tmp deletion guard or timeout configuration is incomplete"
  status=1
fi
if grep -q "^[[:space:]]*'style',[[:space:]]*$" ui-next/src/features/editor/utils/previewSanitizer.ts; then
  echo "[failed] preview sanitizer must not allow unrestricted style attributes"
  status=1
else
  echo "[ok] preview sanitizer does not allow unrestricted style attributes"
fi
if cmp -s assets/reader-ui.js sample-outputs/html/assets/reader-ui.js && cmp -s assets/reader-ui.js sample-outputs/html/content/assets/reader-ui.js; then
  echo "[ok] reader-ui generated assets are synchronized"
else
  echo "[failed] reader-ui generated assets are out of sync; run npm run build:reader-ui and scripts/sync_output_runtime_assets.py"
  status=1
fi

echo
echo "Checking representative sample outputs..."
sample_html_count="$(find sample-outputs/html -type f -name '*.html' 2>/dev/null | wc -l | tr -d ' ')"
sample_pdf_count="$(find sample-outputs/pdf -type f -name '*.pdf' 2>/dev/null | wc -l | tr -d ' ')"
if [ "${sample_html_count:-0}" -ge 2 ]; then
  echo "[ok] sample HTML outputs: $sample_html_count"
else
  echo "[missing] expected representative HTML outputs under sample-outputs/html"
  status=1
fi
if [ "${sample_pdf_count:-0}" -ge 1 ]; then
  echo "[ok] sample PDF outputs: $sample_pdf_count"
else
  echo "[missing] expected representative PDF outputs under sample-outputs/pdf"
  status=1
fi

echo
echo "Checking representative sample HTML dependencies..."
for path in \
  sample-outputs/index.html \
  sample-outputs/.nojekyll \
  sample-outputs/html/index.html \
  sample-outputs/html/content \
  sample-outputs/html/site_libs \
  sample-outputs/html/src/css \
  sample-outputs/html/assets \
  sample-outputs/html/fonts \
  sample-outputs/html/sw.js \
  sample-outputs/html/content/assets
do
  if [ -e "$path" ]; then
    echo "[ok] $path"
  else
    echo "[missing] $path"
    status=1
  fi
done

echo
echo "Checking representative sample HTML excludes source-only runtime artifacts..."
{
  for path in \
    sample-outputs/html/templates \
    sample-outputs/html/PUBLISH_REPO_DIR \
    sample-outputs/html/src/js \
    sample-outputs/html/src/js/ui-clean.js
  do
    if [ -e "$path" ]; then
      printf '%s\n' "$path"
    fi
  done
} >/tmp/ajmun_release_check_public_noise.log
if [ -s /tmp/ajmun_release_check_public_noise.log ]; then
  echo "[failed] Representative HTML contains source-only runtime artifacts"
  cat /tmp/ajmun_release_check_public_noise.log
  status=1
else
  echo "[ok] Representative HTML excludes templates, PUBLISH_REPO_DIR, and src/js"
fi

echo
echo "Checking representative sample HTML for escaped landing CTA..."
if [ "$has_rg" -eq 1 ]; then
  if rg -n '&lt;a class="primary" href="content/00_front.html"&gt;読む&lt;/a&gt;|&lt;span&gt;発行日:' sample-outputs/html/index.html >/tmp/ajmun_release_check_sample_landing.log 2>&1; then
    echo "[failed] sample landing page still contains escaped CTA or meta fragments"
    cat /tmp/ajmun_release_check_sample_landing.log
    status=1
  else
    echo "[ok] sample landing page renders CTA/meta as DOM content"
  fi
else
  if grep -nE '&lt;a class="primary" href="content/00_front.html"&gt;読む&lt;/a&gt;|&lt;span&gt;発行日:' sample-outputs/html/index.html >/tmp/ajmun_release_check_sample_landing.log 2>&1; then
    echo "[failed] sample landing page still contains escaped CTA or meta fragments"
    cat /tmp/ajmun_release_check_sample_landing.log
    status=1
  else
    echo "[ok] sample landing page renders CTA/meta as DOM content"
  fi
fi

echo
echo "Checking representative sample HTML for marker contamination..."
if [ "$has_rg" -eq 1 ]; then
  if rg -n 'auto-id-para|pdf-para-marker' sample-outputs/html/index.html sample-outputs/html/content >/tmp/ajmun_release_check_marker_contamination.log 2>&1; then
    echo "[failed] representative HTML still contains paragraph marker contamination"
    cat /tmp/ajmun_release_check_marker_contamination.log
    status=1
  else
    echo "[ok] no paragraph marker contamination in representative HTML"
  fi
else
  if grep -R -n -E 'auto-id-para|pdf-para-marker' sample-outputs/html/index.html sample-outputs/html/content >/tmp/ajmun_release_check_marker_contamination.log 2>&1; then
    echo "[failed] representative HTML still contains paragraph marker contamination"
    cat /tmp/ajmun_release_check_marker_contamination.log
    status=1
  else
    echo "[ok] no paragraph marker contamination in representative HTML"
  fi
fi

echo
echo "Checking representative PDF target..."
expected_pdf_name="$(
  python3 - <<'PY'
import json
from pathlib import Path

settings = json.loads(Path("config/settings.json").read_text(encoding="utf-8"))
title = (settings.get("project") or {}).get("title") or "index"
print(f"{title}.pdf")
PY
)"
if [ -f "sample-outputs/pdf/$expected_pdf_name" ]; then
  echo "[ok] representative PDF target: sample-outputs/pdf/$expected_pdf_name"
else
  echo "[failed] representative PDF target missing: sample-outputs/pdf/$expected_pdf_name"
  status=1
fi

echo
echo "Checking for tracked credentials..."
credential_file_pattern='(^|/)(\.credentials/|client_secret\.json$|token\.json$|credentials\.json$|service_account\.json$|authorized_user\.json$)'
if [ "$has_rg" -eq 1 ]; then
  if git ls-files | rg -n "$credential_file_pattern" >/tmp/ajmun_release_check_credentials.log 2>&1; then
    echo "[failed] Sensitive credential files are tracked"
    cat /tmp/ajmun_release_check_credentials.log
    status=1
  else
    echo "[ok] No tracked credential files detected"
  fi
else
  if git ls-files | grep -nE "$credential_file_pattern" >/tmp/ajmun_release_check_credentials.log 2>&1; then
    echo "[failed] Sensitive credential files are tracked"
    cat /tmp/ajmun_release_check_credentials.log
    status=1
  else
    echo "[ok] No tracked credential files detected"
  fi
fi

echo
echo "Checking clean-import exclusion policy..."
if grep -q 'private-only helper utilities' docs/PUBLICATION_RUNBOOK.md \
  && grep -q 'private planning notes' docs/PUBLICATION_RUNBOOK.md \
  && grep -q 'private-only helper utilities' docs/DISTRIBUTION.md \
  && grep -q '^docs/0515-temp\.md$' exclude_manifest.txt \
  && grep -q '^config/auth\.json$' exclude_manifest.txt \
  && grep -q '^api/$' public_manifest.txt; then
  echo "[ok] clean import policy excludes private notes and helper utilities"
else
  echo "[failed] clean import policy must document exclusion of private notes and helper utilities"
  status=1
fi

echo
echo "Checking for tracked generated/cache directories..."
{
  git -c core.quotePath=false ls-files 'content/build/**' 'PUBLISH_REPO_DIR/**'
} >/tmp/ajmun_release_check_tracked_cache.log
if [ -s /tmp/ajmun_release_check_tracked_cache.log ]; then
  echo "[failed] Generated/cache distribution artifacts are tracked"
  cat /tmp/ajmun_release_check_tracked_cache.log
  status=1
else
  echo "[ok] content/build and PUBLISH_REPO_DIR are not tracked"
fi

echo
echo "Checking for tracked .DS_Store files..."
git -c core.quotePath=false ls-files '*DS_Store' >/tmp/ajmun_release_check_ds_store.log
if [ -s /tmp/ajmun_release_check_ds_store.log ]; then
  echo "[failed] .DS_Store files are tracked"
  cat /tmp/ajmun_release_check_ds_store.log
  status=1
else
  echo "[ok] No tracked .DS_Store files"
fi

echo
echo "Checking tracked files for local Quarto cache contamination..."
if [ "$has_rg" -eq 1 ]; then
  if git -c core.quotePath=false grep -n -E '/var/folders/.*/quarto-session|quarto-session[[:alnum:]]+' -- . \
    ':!scripts/release_check.sh' >/tmp/ajmun_release_check_quarto_cache.log 2>&1; then
    echo "[failed] Tracked files contain local Quarto session/cache paths"
    cat /tmp/ajmun_release_check_quarto_cache.log
    status=1
  else
    echo "[ok] No local Quarto session/cache paths in tracked files"
  fi
else
  if git -c core.quotePath=false grep -n -E '/var/folders/.*/quarto-session|quarto-session[[:alnum:]]+' -- . \
    ':!scripts/release_check.sh' >/tmp/ajmun_release_check_quarto_cache.log 2>&1; then
    echo "[failed] Tracked files contain local Quarto session/cache paths"
    cat /tmp/ajmun_release_check_quarto_cache.log
    status=1
  else
    echo "[ok] No local Quarto session/cache paths in tracked files"
  fi
fi

echo
echo "Checking production compose secrets..."
if grep -nE 'SESSION_SECRET:.*:-ajmun-prod-session-secret|ADMIN_SECRET:.*:-' docker-compose.prod.yml >/tmp/ajmun_release_check_prod_secrets.log 2>&1; then
  echo "[failed] Production compose contains unsafe default secrets"
  cat /tmp/ajmun_release_check_prod_secrets.log
  status=1
else
  echo "[ok] Production compose requires explicit secrets"
fi

echo
echo "Checking Docker distribution compose configuration..."
if docker compose -f docker-compose.prod.yml --env-file .env.prod.example config >/tmp/ajmun_release_check_compose_prod.log 2>&1; then
  echo "[failed] Production-like compose unexpectedly expands with placeholder .env.prod.example"
  status=1
else
  if grep -qE 'required variable (SESSION_SECRET|ADMIN_SECRET) is missing a value' /tmp/ajmun_release_check_compose_prod.log; then
    echo "[ok] Production-like compose refuses placeholder .env.prod.example secrets"
  else
    echo "[failed] Production-like compose failed for an unexpected reason"
    cat /tmp/ajmun_release_check_compose_prod.log
    status=1
  fi
fi

if docker compose -f docker-compose.yml -f docker-compose.pdf.yml config >/tmp/ajmun_release_check_compose_pdf.log 2>&1; then
  echo "[ok] PDF Docker compose override config expands"
else
  echo "[failed] PDF Docker compose override config does not expand"
  cat /tmp/ajmun_release_check_compose_pdf.log
  status=1
fi

if grep -nE '^[[:space:]]*-[[:space:]]*"?8000:8000"?' docker-compose.prod.yml >/tmp/ajmun_release_check_api_port.log 2>&1; then
  echo "[failed] Production-like compose publishes API port 8000 directly"
  cat /tmp/ajmun_release_check_api_port.log
  status=1
else
  echo "[ok] Production-like compose keeps API port internal by default"
fi

echo
echo "Checking Docker context ignore boundary..."
if grep -nE '^\.credentials/?$|^\.env$|^\.env\.\*$|^out$|^pdf_build$|^\.cache$|^credentials\.json$|^service_account\.json$|^authorized_user\.json$|^client_secret\.json$|^token\.json$' .dockerignore >/tmp/ajmun_release_check_dockerignore.log 2>&1; then
  echo "[ok] Docker context ignores secrets and generated work areas"
else
  echo "[failed] Docker context ignore boundary is missing expected entries"
  status=1
fi

echo
echo "Checking content licensing boundary docs..."
if [ -f CONTENT_LICENSE.md ] && [ -f docs/ASSET_RIGHTS_MANIFEST.md ] && [ -f licenses/OFL-1.1-BIZ-FONTS.txt ]; then
  echo "[ok] Content, asset, and bundled font license docs are present"
else
  echo "[failed] Content, asset, or bundled font license docs are missing"
  status=1
fi

echo
echo "Checking bundled font license notice linkage..."
if grep -n 'licenses/OFL-1.1-BIZ-FONTS.txt' THIRD_PARTY_NOTICES.md >/tmp/ajmun_release_check_font_license.log 2>&1; then
  echo "[ok] Bundled BIZ font license is referenced from THIRD_PARTY_NOTICES.md"
else
  echo "[failed] THIRD_PARTY_NOTICES.md does not reference licenses/OFL-1.1-BIZ-FONTS.txt"
  status=1
fi

echo
echo "Checking public content for editorial placeholders..."
if [ "$has_rg" -eq 1 ]; then
  if rg -n 'TODO|FIXME|要確認|消すかも|書くか未定|一次資料残し|^#{1,6}.*まだ|＜[^＞]*まだ' content index.qmd \
    >/tmp/ajmun_release_check_editorial_placeholders.log 2>&1; then
    echo "[failed] Public content contains editorial placeholders"
    cat /tmp/ajmun_release_check_editorial_placeholders.log
    status=1
  else
    echo "[ok] No public editorial placeholders detected"
  fi
else
  if grep -R -n -E 'TODO|FIXME|要確認|消すかも|書くか未定|一次資料残し|^#{1,6}.*まだ|＜[^＞]*まだ' content index.qmd \
    >/tmp/ajmun_release_check_editorial_placeholders.log 2>&1; then
    echo "[failed] Public content contains editorial placeholders"
    cat /tmp/ajmun_release_check_editorial_placeholders.log
    status=1
  else
    echo "[ok] No public editorial placeholders detected"
  fi
fi

echo
echo "Checking asset rights manifest for unresolved review items..."
if [ "$has_rg" -eq 1 ]; then
  if rg -n '^\| `[^`]+` \| (duplicate-)?needs-review \|' docs/ASSET_RIGHTS_MANIFEST.md >/tmp/ajmun_release_check_asset_review.log 2>&1; then
    echo "[failed] Asset rights manifest still contains unresolved needs-review items"
    cat /tmp/ajmun_release_check_asset_review.log
    status=1
  else
    echo "[ok] No unresolved needs-review assets in manifest"
  fi
else
  if grep -nE '^\| `[^`]+` \| (duplicate-)?needs-review \|' docs/ASSET_RIGHTS_MANIFEST.md >/tmp/ajmun_release_check_asset_review.log 2>&1; then
    echo "[failed] Asset rights manifest still contains unresolved needs-review items"
    cat /tmp/ajmun_release_check_asset_review.log
    status=1
  else
    echo "[ok] No unresolved needs-review assets in manifest"
  fi
fi

echo
echo "Checking public content for Google Docs links..."
if [ "$has_rg" -eq 1 ]; then
  if rg -n 'docs\.google\.com/document/d/' content meta sample-outputs README.md docs \
    --glob '!docs/plans/**' \
    --glob '!docs/0513-plan*.md' \
    --glob '!docs/0514-issue.md' \
    --glob '!docs/0515-temp.md' \
    >/tmp/ajmun_release_check_google_docs.log 2>&1; then
    if rg -n 'google-docs-links-confirmed' docs/ASSET_RIGHTS_MANIFEST.md CONTENT_LICENSE.md >/dev/null 2>&1; then
      echo "[ok] Google Docs links found and marked as confirmed for public release"
    else
      echo "[failed] Google Docs links found without public-release confirmation"
      head -n 40 /tmp/ajmun_release_check_google_docs.log
      status=1
    fi
  else
    echo "[ok] No Google Docs document links found in public content scan"
  fi
else
  if grep -R -n -E 'docs\.google\.com/document/d/' content meta sample-outputs README.md docs \
    --exclude-dir=plans \
    --exclude='0513-plan*.md' \
    --exclude=0514-issue.md \
    >/tmp/ajmun_release_check_google_docs.log 2>&1; then
    if grep -R -n -E 'google-docs-links-confirmed' docs/ASSET_RIGHTS_MANIFEST.md CONTENT_LICENSE.md >/dev/null 2>&1; then
      echo "[ok] Google Docs links found and marked as confirmed for public release"
    else
      echo "[failed] Google Docs links found without public-release confirmation"
      head -n 40 /tmp/ajmun_release_check_google_docs.log
      status=1
    fi
  else
    echo "[ok] No Google Docs document links found in public content scan"
  fi
fi

echo
echo "Checking for hardcoded localhost references..."
if [ "$has_rg" -eq 1 ]; then
  if rg -n 'http://localhost:8000|http://localhost:5173|127\.0\.0\.1:8000' . \
    --glob '!node_modules/**' \
    --glob '!ui-next/node_modules/**' \
    --glob '!.git/**' \
    --glob '!docs/plans/**' \
    --glob '!docs/0513-plan*.md' \
    --glob '!docs/0514-issue.md' \
    --glob '!meta_docs/**' \
    --glob '!PUBLISH_REPO_DIR/**' \
    --glob '!scripts/release_check.sh' \
    --glob '!scripts/debug_*.py' \
    --glob '!scripts/verify_image_feature.py' \
    --glob '!start-dev.sh' \
    --glob '!.env.example' \
    --glob '!docs/setup_guide.md' \
    --glob '!docker-compose.yml' \
    --glob '!docker-compose.pdf.yml' \
    --glob '!CLAUDE.md' \
    --glob '!ui-next/vite.config.ts' \
    --glob '!ui-next/playwright.config.ts' \
    --glob '!api/main.py' \
    >/tmp/ajmun_release_check_localhost.log 2>&1; then
    echo "[warn] Localhost references found"
    cat /tmp/ajmun_release_check_localhost.log
  else
    echo "[ok] No hardcoded localhost references detected in tracked source scan"
  fi
else
  if grep -R -n -E 'http://localhost:8000|http://localhost:5173|127\.0\.0\.1:8000' . \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=__pycache__ \
    --exclude-dir=plans \
    --exclude='0513-plan*.md' \
    --exclude=0514-issue.md \
    --exclude-dir=meta_docs \
    --exclude-dir=PUBLISH_REPO_DIR \
    --exclude-dir=.venv \
    --exclude-dir=.credentials \
    --exclude=release_check.sh \
    --exclude=debug_*.py \
    --exclude=verify_image_feature.py \
    --exclude=start-dev.sh \
    --exclude=.env.example \
    --exclude=setup_guide.md \
    --exclude=docker-compose.yml \
    --exclude=docker-compose.pdf.yml \
    --exclude=CLAUDE.md \
    --exclude=vite.config.ts \
    --exclude=playwright.config.ts \
    --exclude=main.py \
    >/tmp/ajmun_release_check_localhost.log 2>&1; then
    echo "[warn] Localhost references found"
    cat /tmp/ajmun_release_check_localhost.log
  else
    echo "[ok] No hardcoded localhost references detected in tracked source scan"
  fi
fi

echo
echo "Checking tracked generated artifacts outside sample-outputs..."
if [ "$has_rg" -eq 1 ]; then
  if git -c core.quotePath=false ls-files '*.pdf' '*.aux' '*.fdb_latexmk' '*.fls' '*.ilg' '*.ind' '*.idx' '*.toc' '*.raildata' '*.synctex.gz' \
    | rg -v '^(sample-outputs/.*|meta/latex/.*|templates/header\.tex|content/_pdf_tail\.tex)$' >/tmp/ajmun_release_check_generated.log 2>&1; then
    echo "[failed] Generated artifacts are tracked outside sample-outputs"
    cat /tmp/ajmun_release_check_generated.log
    status=1
  else
    echo "[ok] No tracked generated artifacts outside sample-outputs"
  fi
else
  if git -c core.quotePath=false ls-files '*.pdf' '*.aux' '*.fdb_latexmk' '*.fls' '*.ilg' '*.ind' '*.idx' '*.toc' '*.raildata' '*.synctex.gz' \
    | grep -Ev '^(sample-outputs/.*|meta/latex/.*|templates/header\.tex|content/_pdf_tail\.tex)$' >/tmp/ajmun_release_check_generated.log 2>&1; then
    echo "[failed] Generated artifacts are tracked outside sample-outputs"
    cat /tmp/ajmun_release_check_generated.log
    status=1
  else
    echo "[ok] No tracked generated artifacts outside sample-outputs"
  fi
fi

echo
echo "Checking public docs for legacy implementation references..."
if [ "$has_rg" -eq 1 ]; then
  if rg -n 'tools/editor|tools/app|scripts/make_single_html\.py' README.md docs \
    --glob '!docs/plans/**' \
    --glob '!docs/0513-plan*.md' \
    --glob '!docs/0514-issue.md' \
    --glob '!docs/0515-temp.md' >/tmp/ajmun_release_check_legacy_docs.log 2>&1; then
    echo "[failed] Public docs still reference legacy implementation paths"
    cat /tmp/ajmun_release_check_legacy_docs.log
    status=1
  else
    echo "[ok] Public docs do not reference legacy implementation paths"
  fi
else
  if grep -R -n -E 'tools/editor|tools/app|scripts/make_single_html\.py' README.md docs --exclude-dir=plans --exclude='0513-plan*.md' --exclude=0514-issue.md --exclude=0515-temp.md >/tmp/ajmun_release_check_legacy_docs.log 2>&1; then
    echo "[failed] Public docs still reference legacy implementation paths"
    cat /tmp/ajmun_release_check_legacy_docs.log
    status=1
  else
    echo "[ok] Public docs do not reference legacy implementation paths"
  fi
fi

echo
echo "Checking public docs for presentation-heavy wording..."
if [ "$has_rg" -eq 1 ]; then
  if rg -n '<div align=|🏗|🚀|✨|⚡️|📝|📚|📂|📖|single-click|Smart Editor|Professional Publishing|The easiest way' README.md docs \
    --glob '!docs/plans/**' \
    --glob '!docs/0513-plan*.md' \
    --glob '!docs/0514-issue.md' \
    --glob '!docs/0515-temp.md' >/tmp/ajmun_release_check_tone.log 2>&1; then
    echo "[failed] Public docs still contain presentation-heavy wording"
    cat /tmp/ajmun_release_check_tone.log
    status=1
  else
    echo "[ok] Public docs use plain technical wording"
  fi
else
  if grep -R -n -E '<div align=|🏗|🚀|✨|⚡️|📝|📚|📂|📖|single-click|Smart Editor|Professional Publishing|The easiest way' README.md docs --exclude-dir=plans --exclude='0513-plan*.md' --exclude=0514-issue.md --exclude=0515-temp.md >/tmp/ajmun_release_check_tone.log 2>&1; then
    echo "[failed] Public docs still contain presentation-heavy wording"
    cat /tmp/ajmun_release_check_tone.log
    status=1
  else
    echo "[ok] Public docs use plain technical wording"
  fi
fi

echo
echo "Checking tracked root artifacts outside the public surface..."
{
  git -c core.quotePath=false ls-files \
    'TODO.md' \
    'implementation_plan.md' \
    'boundary-paragraphs.json' \
    'boundary-paragraphs.txt' \
    '_quarto_yml' \
    'chapter-format.yml' \
    'temp_log.txt' \
    'Readme/**'
  if [ "$has_rg" -eq 1 ]; then
    git -c core.quotePath=false ls-files '*.tex' | rg -x '[^/]+\.tex' || true
  else
    git -c core.quotePath=false ls-files '*.tex' | grep -E '^[^/]+\.tex$' || true
  fi
} | while IFS= read -r path; do
  if [ -e "$path" ]; then
    printf '%s\n' "$path"
  fi
done >/tmp/ajmun_release_check_root_artifacts.log
if [ -s /tmp/ajmun_release_check_root_artifacts.log ]; then
  echo "[failed] Root tracked artifacts remain outside the intended public surface"
  cat /tmp/ajmun_release_check_root_artifacts.log
  status=1
else
  echo "[ok] No tracked root artifacts remain outside the intended public surface"
fi

echo
echo "Checking API docs default exposure guidance..."
if [ "$has_rg" -eq 1 ]; then
  if rg -n 'EXPOSE_API_DOCS=false|API docs are disabled by default|EXPOSE_API_DOCS=true' README.md docs \
    --glob '!docs/plans/**' \
    --glob '!docs/0513-plan*.md' \
    --glob '!docs/0514-issue.md' >/tmp/ajmun_release_check_api_docs.log 2>&1; then
    echo "[ok] Public docs describe API docs default exposure"
  else
    echo "[failed] Public docs do not describe API docs default exposure"
    status=1
  fi
else
  if grep -R -n -E 'EXPOSE_API_DOCS=false|API docs are disabled by default|EXPOSE_API_DOCS=true' README.md docs --exclude-dir=plans --exclude='0513-plan*.md' --exclude=0514-issue.md >/tmp/ajmun_release_check_api_docs.log 2>&1; then
    echo "[ok] Public docs describe API docs default exposure"
  else
    echo "[failed] Public docs do not describe API docs default exposure"
    status=1
  fi
fi

exit "$status"
