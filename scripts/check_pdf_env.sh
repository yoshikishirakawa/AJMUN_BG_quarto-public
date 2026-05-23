#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

status=0
run_html_smoke=0
run_pdf_smoke=0

for arg in "$@"; do
  case "$arg" in
    --render-smoke|--render-html-smoke)
      run_html_smoke=1
      ;;
    --render-pdf-smoke)
      run_pdf_smoke=1
      ;;
    *)
      echo "[warn] unknown option: $arg"
      ;;
  esac
done

check_cmd() {
  local cmd="$1"
  local label="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "[ok] $label: $(command -v "$cmd")"
  else
    echo "[missing] $label ($cmd)"
    status=1
  fi
}

print_tex_help() {
  cat <<'EOF'

PDF toolchain setup:
  - Host macOS: install MacTeX or BasicTeX, then ensure /Library/TeX/texbin is on PATH.
  - Host Linux: install TeX Live packages that provide lualatex and latexmk.
  - Docker PDF workflow: docker compose -f docker-compose.yml -f docker-compose.pdf.yml up --build
  - Standard Docker workflow is lightweight and does not include TeX by default.
EOF
}

echo "Checking PDF toolchain..."
check_cmd quarto "Quarto"
check_cmd lualatex "LuaLaTeX"
check_cmd latexmk "latexmk"

if [ "$status" -ne 0 ]; then
  print_tex_help
fi

echo
echo "Checking config files..."
for path in config/settings.json _quarto.yml; do
  if [ -f "$path" ]; then
    echo "[ok] $path"
  else
    echo "[missing] $path"
    status=1
  fi
done

if [ "$run_html_smoke" -eq 1 ]; then
  echo
  echo "Running Quarto HTML smoke render..."
  if quarto render --to html -M embed-resources=false >/tmp/ajmun_check_pdf_env.log 2>&1; then
    echo "[ok] quarto render --to html"
    if [ -f out/index.html ]; then
      echo "[ok] out/index.html"
    else
      echo "[failed] out/index.html missing"
      status=1
    fi

    chapter_count="$(find out/content -maxdepth 1 -type f -name '*.html' 2>/dev/null | wc -l | tr -d ' ')"
    if [ "${chapter_count:-0}" -ge 2 ]; then
      echo "[ok] chapter html count: $chapter_count"
    else
      echo "[failed] expected multi-page chapter HTML outputs under out/content"
      status=1
    fi

    for asset in out/assets/reader-ui.js out/assets/pdf-page-indicator.js out/content/assets/reader-ui.js out/content/assets/pdf-page-indicator.js; do
      if [ -f "$asset" ]; then
        echo "[ok] $asset"
      else
        echo "[failed] missing asset: $asset"
        status=1
      fi
    done
  else
    echo "[failed] quarto render --to html"
    tail -n 40 /tmp/ajmun_check_pdf_env.log || true
    status=1
  fi
fi

if [ "$run_pdf_smoke" -eq 1 ]; then
  echo
  echo "Running Quarto PDF smoke render..."
  if quarto render --to pdf >/tmp/ajmun_check_pdf_env_pdf.log 2>&1; then
    echo "[ok] quarto render --to pdf"
    pdf_count="$(find out -maxdepth 1 -type f -name '*.pdf' | wc -l | tr -d ' ')"
    if [ "${pdf_count:-0}" -ge 1 ]; then
      echo "[ok] pdf outputs in out/: $pdf_count"
    else
      echo "[failed] expected at least one PDF output in out/"
      status=1
    fi
  else
    echo "[failed] quarto render --to pdf"
    tail -n 40 /tmp/ajmun_check_pdf_env_pdf.log || true
    if [ -f index.log ]; then
      echo "--- index.log tail ---"
      tail -n 40 index.log || true
    fi
    print_tex_help
    status=1
  fi
fi

exit "$status"
