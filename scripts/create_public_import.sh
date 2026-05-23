#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST_DIR="${1:-/private/tmp/ajmun-bg-public-clean}"
PUBLIC_REMOTE="${PUBLIC_REMOTE:-https://github.com/yoshikishirakawa/AJMUN_BG_quarto-public}"

cd "$ROOT_DIR"

case "$DEST_DIR" in
  ""|"/"|"$ROOT_DIR"|"$ROOT_DIR/"*)
    echo "Refusing unsafe destination: $DEST_DIR" >&2
    exit 2
    ;;
esac

if [ ! -f public_manifest.txt ] || [ ! -f exclude_manifest.txt ]; then
  echo "public_manifest.txt and exclude_manifest.txt are required" >&2
  exit 2
fi

rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"

rsync_args=(-a --include ".env.example" --include ".env.prod.example")
while IFS= read -r pattern || [ -n "$pattern" ]; do
  case "$pattern" in
    ""|\#*) ;;
    *) rsync_args+=(--exclude "$pattern") ;;
  esac
done < exclude_manifest.txt

while IFS= read -r path || [ -n "$path" ]; do
  case "$path" in
    ""|\#*) continue ;;
  esac
  if [ ! -e "$path" ]; then
    echo "Missing public manifest entry: $path" >&2
    exit 1
  fi
  rsync "${rsync_args[@]}" --relative "$path" "$DEST_DIR"/
done < public_manifest.txt

(
  cd "$DEST_DIR"
  if find . -name '.DS_Store' -print -quit | grep -q .; then
    echo "Clean tree contains .DS_Store" >&2
    exit 1
  fi

  forbidden_regex='(^|/)(\.git|\.credentials|\.claude|\.vscode|node_modules|out|pdf_build|PUBLISH_REPO_DIR|\.cache|\.quarto|logs|error|meta_docs|docs/plans)(/|$)|(^|/)(\.env|config/auth\.json|credentials\.json|service_account\.json|authorized_user\.json|client_secret\.json|token\.json|docs/0515-temp\.md|temp_log\.txt)$|(^|/)scripts/debug_.*\.py$'
  if find . -print | sed 's#^\./##' | grep -E "$forbidden_regex" >/tmp/ajmun_public_import_forbidden.log; then
    echo "Clean tree contains forbidden paths:" >&2
    cat /tmp/ajmun_public_import_forbidden.log >&2
    exit 1
  fi

  git init >/dev/null
  git branch -M main
  git remote add origin "$PUBLIC_REMOTE"
)

echo "Created clean public import tree: $DEST_DIR"
echo "Remote configured: $PUBLIC_REMOTE"
echo "Next: run checks in $DEST_DIR, then commit and push only after explicit confirmation."
