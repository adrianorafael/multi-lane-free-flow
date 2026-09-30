#!/usr/bin/env bash
# scan-secrets.sh — pre-commit secret & tenant-data scanner for Dynatrace App repositories.
#
# Part of "Development Pattern for Dynatrace".
# Enforces rule R1: nothing sensitive reaches the repository.
#
# USAGE
#   bash scan-secrets.sh                 # scan the working tree (git-aware; honours .gitignore)
#   bash scan-secrets.sh path/to/file    # scan specific paths
#   git diff --cached | bash scan-secrets.sh --stdin    # scan STAGED content (what ships)
#
# EXIT CODES
#   0  clean
#   1  findings — DO NOT COMMIT
#
# SUPPRESSING A FALSE POSITIVE
#   Append the marker  scan-secrets:allow  as a comment on the offending line,
#   or list a path (one per line, substring match) in .secretscanignore at the repo root.
#   Suppress deliberately and rarely: every suppression is a hole in the net.

set -uo pipefail

RED=$'\033[0;31m'; YEL=$'\033[0;33m'; GRN=$'\033[0;32m'; DIM=$'\033[2m'; NC=$'\033[0m'
[ -t 1 ] || { RED=""; YEL=""; GRN=""; DIM=""; NC=""; }

ALLOW_MARKER='scan-secrets:allow'
FINDINGS=0

# ── Patterns ────────────────────────────────────────────────────────────────────
# name|severity|extended-regex
PATTERNS=(
  "Dynatrace token|HIGH|dt0[a-zA-Z][0-9]{2}\.[A-Z0-9]{8,24}\.[A-Z0-9]{60,}"
  "Dynatrace token (short form)|HIGH|dt0[acs][0-9]{2}\.[A-Za-z0-9_-]{20,}"
  "Private key block|HIGH|-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----"
  "AWS access key id|HIGH|\b(AKIA|ASIA)[0-9A-Z]{16}\b"
  "Bearer token literal|HIGH|[Bb]earer[[:space:]]+[A-Za-z0-9._-]{25,}"
  "Hardcoded credential|HIGH|(secret|token|password|passwd|apikey|api_key|client_secret)[[:space:]]*[:=][[:space:]]*[\"'][^\"']{8,}[\"']"
  "Real tenant URL|HIGH|https://[a-z]{3}[0-9]{5}\.(apps|live|sprint|dev)\.dynatrace\.com"
  "Managed tenant URL|MED|https://[A-Za-z0-9.-]+/e/[0-9a-f-]{36}"
  "Bare tenant id|MED|\b[a-z]{3}[0-9]{5}\b"
  "Dynatrace entity id|MED|\b(HOST|SERVICE|PROCESS_GROUP|PROCESS_GROUP_INSTANCE|APPLICATION|KUBERNETES_CLUSTER|CLOUD_APPLICATION)-[0-9A-F]{16}\b"
  "Email address|MED|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
  "Private IPv4|LOW|\b(10\.[0-9]{1,3}|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\.[0-9]{1,3}\.[0-9]{1,3}\b"
)

# Placeholders and well-known safe values that must never be reported.
SAFE='YOUR-ENVIRONMENT|YOUR-TENANT|YOUR-PLATFORM-TOKEN|YOUR-TOKEN|<tenant-id>|abc12345|example\.com|example\.org|localhost|noreply@|user@example|127\.0\.0\.1|0\.0\.0\.0|-0{16}$|-0{16}[^0-9A-F]'

# ── Helpers ─────────────────────────────────────────────────────────────────────
is_allowlisted_path() {
  local f="$1" root ignore
  root="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
  ignore="$root/.secretscanignore"
  [ -f "$ignore" ] || return 1
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in \#*) continue ;; esac
    case "$f" in *"$line"*) return 0 ;; esac
  done < "$ignore"
  return 1
}

report() { # file line severity name text
  local sev="$3" color="$YEL"
  [ "$sev" = HIGH ] && color="$RED"
  [ "$sev" = LOW ] && color="$DIM"
  printf '%s[%s]%s %s\n      %s:%s\n      %s%s%s\n\n' \
    "$color" "$sev" "$NC" "$4" "$1" "$2" "$DIM" "${5:0:160}" "$NC"
  FINDINGS=$((FINDINGS + 1))
}

# Scan one real file. One grep per pattern over the whole file (not per line) — the
# per-line variant spawns tens of thousands of processes and takes minutes on a small repo.
scan_buffer() { # path, label
  local path="$1" label="$2" entry name rest sev re hitline line_no text match hit
  for entry in "${PATTERNS[@]}"; do
    name="${entry%%|*}"; rest="${entry#*|}"
    sev="${rest%%|*}"; re="${rest#*|}"
    while IFS= read -r hitline; do
      [ -z "$hitline" ] && continue
      line_no="${hitline%%:*}"; text="${hitline#*:}"
      case "$text" in *"$ALLOW_MARKER"*) continue ;; esac
      # Check each MATCHED SUBSTRING against the placeholder allowlist, not the whole
      # line: otherwise one placeholder on a line would mask a real secret beside it.
      hit=0
      while IFS= read -r match; do
        [ -z "$match" ] && continue
        printf '%s' "$match" | grep -qE -- "$SAFE" && continue
        hit=1
      done < <(printf '%s' "$text" | grep -oE -- "$re" 2>/dev/null || true)
      [ "$hit" -eq 1 ] && report "$label" "$line_no" "$sev" "$name" "$text"
    done < <(grep -nE -- "$re" "$path" 2>/dev/null || true)
  done
}

scan_stream() { # stdin, pseudo-filename
  local label="$1" tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  scan_buffer "$tmp" "$label"
  rm -f "$tmp"
}

scan_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  is_allowlisted_path "$f" && return 0
  # skip binaries and lockfiles
  case "$f" in
    *.png|*.jpg|*.jpeg|*.gif|*.ico|*.woff|*.woff2|*.ttf|*.pdf|*.zip|*.tgz) return 0 ;;
    */package-lock.json|package-lock.json|*/node_modules/*) return 0 ;;
  esac
  grep -Iq . "$f" 2>/dev/null || return 0   # binary check
  scan_buffer "$f" "$f"
}

# ── Main ────────────────────────────────────────────────────────────────────────
echo "🔍 Scanning for secrets and tenant data…"
echo

if [ "${1:-}" = "--stdin" ]; then
  scan_stream "(staged diff)"
elif [ "$#" -gt 0 ]; then
  for f in "$@"; do scan_file "$f"; done
elif git rev-parse --git-dir >/dev/null 2>&1; then
  # tracked + untracked, excluding gitignored files
  while IFS= read -r f; do scan_file "$f"; done < <(git ls-files --cached --others --exclude-standard)
else
  while IFS= read -r f; do scan_file "$f"; done < <(find . -type f -not -path '*/.git/*' -not -path '*/node_modules/*')
fi

# ── Structural checks (git repos only) ──────────────────────────────────────────
if git rev-parse --git-dir >/dev/null 2>&1; then
  # .env.example is the committed placeholder template the pattern requires — not a secret file.
  tracked_sensitive="$(git ls-files | grep -Ei '(^|/)\.env($|\.)|(^|/)\.dt-app/|\.pem$|\.key$|\.p12$|\.cert$' | grep -Ev '(^|/)\.env\.example$' || true)"
  if [ -n "$tracked_sensitive" ]; then
    echo "${RED}[HIGH]${NC} Sensitive files are TRACKED by git:"
    printf '      %s\n' $tracked_sensitive
    echo "      Fix: git rm --cached <file>  — then rotate any credential it contained."
    echo
    FINDINGS=$((FINDINGS + 1))
  fi
  for entry in .dt-app .env; do
    if [ -e "$entry" ] && ! git check-ignore -q "$entry" 2>/dev/null; then
      echo "${YEL}[MED]${NC} '$entry' exists but is not gitignored. Add it to .gitignore."
      echo
      FINDINGS=$((FINDINGS + 1))
    fi
  done
  if [ -f app.config.json ] && ! grep -q 'YOUR-ENVIRONMENT' app.config.json; then
    echo "${YEL}[MED]${NC} app.config.json does not contain the YOUR-ENVIRONMENT placeholder."
    echo "      Confirm 'environmentUrl' is not a real tenant URL before committing."
    echo
    FINDINGS=$((FINDINGS + 1))
  fi
fi

# ── Verdict ─────────────────────────────────────────────────────────────────────
if [ "$FINDINGS" -eq 0 ]; then
  echo "${GRN}✅ Clean — no secrets or tenant data detected.${NC}"
  echo "${DIM}   A clean scan is necessary, not sufficient. Still read your own diff.${NC}"
  exit 0
fi

echo "${RED}❌ $FINDINGS finding(s). DO NOT COMMIT.${NC}"
echo
echo "Next steps:"
echo "  1. Replace real values with placeholders (YOUR-ENVIRONMENT, YOUR-PLATFORM-TOKEN)."
echo "  2. Move real values into .env (gitignored)."
echo "  3. Re-run this scan."
echo "  4. If a credential was ever committed or pushed: ROTATE IT. Cleaning history is not enough."
echo
echo "${DIM}False positive? Add '${ALLOW_MARKER}' as a comment on that line, or list the path in .secretscanignore.${NC}"
exit 1
