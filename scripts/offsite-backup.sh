#!/bin/bash
# RubricMaker — copy backups made by backup.sh to an off-site, S3-compatible bucket, encrypted.
#
# Usage:
#   ./scripts/offsite-backup.sh push backups/20260515_120000   → upload, verify, prune old copies
#   ./scripts/offsite-backup.sh list                           → backups in the bucket, oldest first
#   ./scripts/offsite-backup.sh pull latest [dir]              → download into dir (default ./backups)
#   ./scripts/offsite-backup.sh pull 20260515_120000 [dir]
#
# Configure .env.backup first (see .env.backup.example). Uploads are encrypted on this server with
# BACKUP_ENCRYPTION_PASSPHRASE; without that passphrase no off-site copy can be restored, so keep a
# copy of it somewhere other than this server. A pulled backup is checked against its SHA256SUMS
# and can then be restored with ./scripts/restore.sh.
#
# OFFSITE_KEEP (default 30) is how many off-site backups are kept; older ones are deleted after a
# successful push. Set it to 0 when the bucket's own lifecycle rules expire old copies instead.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/compose.sh
source "$SCRIPT_DIR/lib/compose.sh"
# shellcheck source=lib/offsite.sh
source "$SCRIPT_DIR/lib/offsite.sh"

usage() {
    sed -n '4,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 1
}

cmd_push() {
    local src="${1:-}"
    [[ -n "$src" && -d "$src" ]] || { echo "Error: backup directory not found: ${src:-<none>}" >&2; exit 1; }
    src="$(cd "$src" && pwd)"
    local name
    name="$(basename "$src")"
    is_backup_name "$name" || { echo "Error: $src is not named like a backup (YYYYMMDD_HHMMSS)." >&2; exit 1; }
    if [[ "$(cat "$src/FORMAT" 2>/dev/null)" != "2" ]]; then
        echo "Error: $src is not a format-2 backup made by backup.sh." >&2
        exit 1
    fi
    # Backups made before checksums existed get them now, from the files as they are on disk.
    [[ -f "$src/SHA256SUMS" ]] || write_checksums "$src"
    verify_checksums "$src"

    echo "▶  Uploading $name off-site (encrypted)..."
    offsite_rclone "$src" copy "$src" "vault:$name"
    echo "▶  Verifying the uploaded copy against the local files..."
    offsite_rclone "$src" cryptcheck "$src" "vault:$name"
    echo "   ✓ $name is off-site and verified"

    local keep="${OFFSITE_KEEP:-30}"
    [[ "$keep" =~ ^[0-9]+$ ]] || { echo "Error: OFFSITE_KEEP must be a whole number." >&2; exit 1; }
    if ((keep > 0)); then
        local listing entry
        local -a names=()
        listing="$(offsite_list "$src")"
        while IFS= read -r entry; do [[ -n "$entry" ]] && names+=("$entry"); done <<< "$listing"
        local count=${#names[@]}
        if ((count > keep)); then
            local old
            for old in "${names[@]:0:count-keep}"; do
                # The backup just pushed is never pruned, however the clock or OFFSITE_KEEP is set.
                [[ "$old" == "$name" ]] && continue
                offsite_rclone "$src" purge "vault:$old"
                echo "   ✓ pruned off-site backup $old"
            done
        fi
    fi
}

cmd_list() {
    local tmp
    tmp="$(mktemp -d)"
    offsite_list "$tmp"
    rmdir "$tmp"
}

cmd_pull() {
    local name="${1:-}" dest="${2:-./backups}"
    [[ -n "$name" ]] || usage
    mkdir -p "$dest"
    dest="$(cd "$dest" && pwd)"
    if [[ "$name" == latest ]]; then
        name="$(offsite_list "$dest" | tail -n 1)"
        [[ -n "$name" ]] || { echo "Error: the off-site bucket holds no backups." >&2; exit 1; }
    fi
    is_backup_name "$name" || { echo "Error: not a backup name: $name" >&2; exit 1; }
    if [[ -e "$dest/$name" ]]; then
        echo "Error: $dest/$name already exists; remove it or pull into another directory." >&2
        exit 1
    fi
    echo "▶  Downloading off-site backup $name..."
    # A failed or corrupt download is removed, so it can neither be restored nor block a retry.
    if ! offsite_rclone "$dest" copy "vault:$name" "$dest/$name" || ! verify_checksums "$dest/$name"; then
        rm -rf -- "${dest:?}/$name"
        echo "Error: could not download a verified copy of $name; nothing was kept." >&2
        exit 1
    fi
    echo "   ✓ $dest/$name (checksums verified)"
    echo ""
    echo "To restore:  ./scripts/restore.sh $dest/$name"
}

load_backup_env
case "${1:-}" in
    push) require_offsite_config; cmd_push "${2:-}" ;;
    list) require_offsite_config; cmd_list ;;
    pull) require_offsite_config; cmd_pull "${2:-}" "${3:-./backups}" ;;
    *) usage ;;
esac
