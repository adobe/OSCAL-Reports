#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# List pass entries, let user pick one (or add new), paste credentials, parse and store;
# or delete an existing entry (with confirmation).
# Credentials are read from stdin (paste then Ctrl+D); they are not written to disk.
#
# This script does NOT read AWS Secrets Manager. On EC2, SM → pass sync is handled
# by ec2_automation (pass_secrets_sync_run via cron).
#
# Usage:
#   ./scripts/debug/update-pass-credential.sh
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
  echo "  d) Delete an entry"
  echo "  q) Exit"
  echo ""
  echo -n "Which entry do you want to update? (1-${#entries[@]}, 0=new, d=delete, q=exit): "
  read -r choice

  choice="${choice#"${choice%%[![:space:]]*}"}"
  choice="${choice%"${choice##*[![:space:]]}"}"
  if [[ "$choice" == "q" || "$choice" == "Q" ]]; then
    echo "Exiting."
    exit 0
  fi

  if [[ "$choice" == "d" || "$choice" == "D" ]]; then
    echo ""
    echo "Delete an entry (cannot be undone):"
    for i in "${!entries[@]}"; do
      echo "  $((i + 1))) ${entries[$i]}"
    done
    echo -n "Which entry to delete? (1-${#entries[@]}, c=cancel): "
    read -r del_choice
    del_choice="${del_choice#"${del_choice%%[![:space:]]*}"}"
    del_choice="${del_choice%"${del_choice##*[![:space:]]}"}"
    if [[ "$del_choice" == "c" || "$del_choice" == "C" ]]; then
      echo "Cancelled."
      exit 0
    fi
    if [[ ! "$del_choice" =~ ^[0-9]+$ ]]; then
      echo "Error: Invalid selection." >&2
      exit 1
    fi
    del_idx=$((del_choice - 1))
    if [[ del_idx -lt 0 || del_idx -ge ${#entries[@]} ]]; then
      echo "Error: Selection out of range." >&2
      exit 1
    fi
    ENTRY="${entries[$del_idx]}"
    echo ""
    echo "You are about to permanently delete: $ENTRY"
    echo -n "Type the entry path exactly to confirm: "
    read -r confirm
    confirm="${confirm#"${confirm%%[![:space:]]*}"}"
    confirm="${confirm%"${confirm##*[![:space:]]}"}"
    if [[ "$confirm" != "$ENTRY" ]]; then
      echo "Confirmation did not match. Aborting." >&2
      exit 1
    fi
    # -r removes a subtree if the path is a directory in the store; -f skips gpg interactive prompt
    pass rm -rf "$ENTRY"
    echo "Deleted: $ENTRY"
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
echo "You are about to OVERWRITE: $ENTRY"
echo -n "Type the entry path exactly to confirm: "
read -r update_confirm
update_confirm="${update_confirm#"${update_confirm%%[![:space:]]*}"}"
update_confirm="${update_confirm%"${update_confirm##*[![:space:]]}"}"
if [[ "$update_confirm" != "$ENTRY" ]]; then
  echo "Confirmation did not match. Aborting." >&2
  exit 1
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

# Sanity check: warn if the entry name and pasted content look mismatched (e.g. an
# "-SSH" entry name being overwritten with AWS credentials, or vice versa). This is a
# heuristic, not validation of the secret itself — it exists to catch exactly the kind
# of wrong-numbered-menu-item mistake that has silently destroyed SSH keys before.
looks_like_private_key=0
if [[ "$content" == *"BEGIN OPENSSH PRIVATE KEY"* || "$content" == *"BEGIN RSA PRIVATE KEY"* || "$content" == *"BEGIN EC PRIVATE KEY"* || "$content" == *"BEGIN PRIVATE KEY"* ]]; then
  looks_like_private_key=1
fi
looks_like_aws_creds=0
if [[ "$content" == *"aws_access_key_id="* || "$content" == *"aws_secret_access_key="* ]]; then
  looks_like_aws_creds=1
fi
entry_lower="$(printf '%s' "$ENTRY" | tr '[:upper:]' '[:lower:]')"
if [[ "$entry_lower" == *ssh* && "$looks_like_private_key" -eq 0 ]]; then
  echo "" >&2
  echo "⚠  '$ENTRY' looks like an SSH key entry, but the pasted content does not look like a private key (no BEGIN ... PRIVATE KEY header)." >&2
  echo -n "Overwrite anyway? Type YES to confirm: " >&2
  read -r mismatch_confirm
  [[ "$mismatch_confirm" == "YES" ]] || { echo "Aborting." >&2; exit 1; }
elif [[ "$entry_lower" != *ssh* && "$looks_like_private_key" -eq 1 ]]; then
  echo "" >&2
  echo "⚠  The pasted content looks like a private key, but '$ENTRY' doesn't look like an SSH key entry." >&2
  echo -n "Overwrite anyway? Type YES to confirm: " >&2
  read -r mismatch_confirm
  [[ "$mismatch_confirm" == "YES" ]] || { echo "Aborting." >&2; exit 1; }
elif [[ "$entry_lower" == *ssh* && "$looks_like_aws_creds" -eq 1 ]]; then
  echo "" >&2
  echo "⚠  '$ENTRY' looks like an SSH key entry, but the pasted content looks like AWS credentials (aws_access_key_id/aws_secret_access_key)." >&2
  echo -n "Overwrite anyway? Type YES to confirm: " >&2
  read -r mismatch_confirm
  [[ "$mismatch_confirm" == "YES" ]] || { echo "Aborting." >&2; exit 1; }
fi

echo "$content" | pass insert -m "$ENTRY" --force

echo "Done. Pass entry updated: $ENTRY"
echo "Verify with: pass show \"$ENTRY\""
