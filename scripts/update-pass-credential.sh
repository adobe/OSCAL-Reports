#!/usr/bin/env bash
# List pass entries, let user pick one (or add new), paste credentials, parse and store.
# Credentials are read from stdin (paste then Ctrl+D); they are not written to disk.
#
# Usage:
#   ./scripts/update-pass-credential.sh
#
# Required: pass, gpg
# Supports: AWS-style (aws_access_key_id=..., aws_secret_access_key=..., aws_session_token=...)
#           and generic key=value or plain lines; all stored as multi-line in pass.

set -e

command -v pass >/dev/null 2>&1 || { echo "Error: pass is required. Install: brew install pass" >&2; exit 1; }

PASS_DIR="${PASSWORD_STORE_DIR:-$HOME/.password-store}"
if [[ ! -d "$PASS_DIR" ]]; then
  echo "Error: Password store not found at $PASS_DIR" >&2
  exit 1
fi

# List all pass entries (paths relative to store, no .gpg suffix)
list_entries() {
  find "$PASS_DIR" -type f -name "*.gpg" | sed "s|^$PASS_DIR/||;s|\.gpg$||" | sort
}

# Build numbered list and prompt for selection
entries=()
while IFS= read -r line; do
  [[ -n "$line" ]] && entries+=( "$line" )
done < <(list_entries)

echo "Stored credentials (pass entries):"
echo ""

if [[ ${#entries[@]} -eq 0 ]]; then
  echo "  (none found)"
  echo ""
  echo "You can add a new entry. Enter the full pass path (e.g. AWS/MyProfile or GitHub/token), or press Enter to exit:"
  read -r ENTRY
  ENTRY="${ENTRY#"${ENTRY%%[![:space:]]*}"}"
  ENTRY="${ENTRY%"${ENTRY##*[![:space:]]}"}"
  if [[ -z "$ENTRY" ]]; then
    echo "Exiting."
    exit 0
  fi
else
  for i in "${!entries[@]}"; do
    echo "  $((i + 1))) ${entries[$i]}"
  done
  echo "  0) New entry"
  echo "  q) Exit"
  echo ""
  echo -n "Which entry do you want to update? (1-${#entries[@]}, 0=new, q=exit): "
  read -r choice

  choice="${choice#"${choice%%[![:space:]]*}"}"
  choice="${choice%"${choice##*[![:space:]]}"}"
  if [[ "$choice" == "q" || "$choice" == "Q" ]]; then
    echo "Exiting."
    exit 0
  fi

  if [[ ! "$choice" =~ ^[0-9]+$ ]]; then
    echo "Error: Invalid selection." >&2
    exit 1
  fi

  if [[ "$choice" -eq 0 ]]; then
    echo "Enter the full pass path for the new entry (e.g. AWS/MyProfile or GitHub/token):"
    read -r ENTRY
    ENTRY="${ENTRY#"${ENTRY%%[![:space:]]*}"}"
    ENTRY="${ENTRY%"${ENTRY##*[![:space:]]}"}"
    if [[ -z "$ENTRY" ]]; then
      echo "Error: Entry name cannot be empty." >&2
      exit 1
    fi
  else
    idx=$((choice - 1))
    if [[ idx -lt 0 || idx -ge ${#entries[@]} ]]; then
      echo "Error: Selection out of range." >&2
      exit 1
    fi
    ENTRY="${entries[$idx]}"
  fi
fi

echo ""
echo "Paste your secret/credentials below (key=value lines or freeform). When done, press Ctrl+D:"
echo ""

# Read and parse pasted input
declare -a lines
while IFS= read -r line; do
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" ]] && continue
  lines+=( "$line" )
done

if [[ ${#lines[@]} -eq 0 ]]; then
  echo "Error: No input received. Paste your credentials and press Ctrl+D." >&2
  exit 1
fi

# Parse into key=value; also accept plain lines (store as-is)
declare -a out
for line in "${lines[@]}"; do
  if [[ "$line" == *"="* ]]; then
    # key=value (use first = as separator so value can contain =)
    out+=( "$line" )
  else
    # Plain line (e.g. password-only or comment)
    out+=( "$line" )
  fi
done

# Build content for pass (multi-line)
content=""
for line in "${out[@]}"; do
  content+="$line"$'\n'
done
content="${content%$'\n'}"

echo "$content" | pass insert -m "$ENTRY" --force

echo "Done. Pass entry updated: $ENTRY"
echo "Verify with: pass show \"$ENTRY\""
