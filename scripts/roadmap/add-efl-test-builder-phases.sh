#!/bin/bash
# RubricMaker — add the EFL test-builder expansion phases to the Roadmap project board
#
# Creates one draft item per file in scripts/roadmap/efl-test-builder/ (in file
# order), numbered after the highest "Phase N" already on the board. Safe to re-run:
# cards already on the board (matched by title) are skipped and keep their numbers.
# Plan: docs/TEST_BUILDER_EFL_EXPANSION_PLAN.md
#
# Requires the GitHub CLI with the project scope:
#   gh auth refresh -s project
#
# Usage:
#   ./scripts/roadmap/add-efl-test-builder-phases.sh [options]
#
# Options:
#   --owner NAME          Project owner (default: NesiciCoding)
#   --project NUMBER      Project number (default: first owner project whose title contains "roadmap")
#   --start-phase N       First phase number (default: highest "Phase N" on the board + 1)
#   --status NAME         Status column to place items in (e.g. "Backlog"; default: none)
#   --dry-run             Print what would be created without touching the board

set -euo pipefail

OWNER="NesiciCoding"
PROJECT=""
START_PHASE=""
STATUS=""
DRY_RUN=false

while [ $# -gt 0 ]; do
    case "$1" in
        --owner) OWNER="$2"; shift 2 ;;
        --project) PROJECT="$2"; shift 2 ;;
        --start-phase) START_PHASE="$2"; shift 2 ;;
        --status) STATUS="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

ITEMS_DIR="$(cd "$(dirname "$0")" && pwd)/efl-test-builder"

if [ -z "$PROJECT" ]; then
    PROJECT=$(gh project list --owner "$OWNER" --format json \
        --jq '[.projects[] | select(.title | test("roadmap"; "i"))][0].number // empty')
    if [ -z "$PROJECT" ]; then
        echo "No project with \"roadmap\" in its title found for $OWNER — pass --project NUMBER." >&2
        exit 1
    fi
fi
echo "Project: $OWNER #$PROJECT"

# Fetched on its own (not inside the phase-number pipeline below) so a failing gh call stops the
# script via `set -e` instead of silently restarting the numbering at Phase 1.
EXISTING_TITLES=$(gh project item-list "$PROJECT" --owner "$OWNER" --limit 2000 --format json --jq '.items[].title')

FILES=("$ITEMS_DIR"/*.md)

card_suffix() {
    head -1 "$1" | sed -e 's/^# Phase {N} — //'
}

# Phase number of the board item titled "Phase N — <suffix>", if one exists.
existing_phase_for() {
    local suffix="$1" title re='^Phase ([0-9]+) — (.*)$'
    while IFS= read -r title; do
        if [[ $title =~ $re ]] && [ "${BASH_REMATCH[2]}" = "$suffix" ]; then
            echo "${BASH_REMATCH[1]}"
            return
        fi
    done <<< "$EXISTING_TITLES"
}

# Resuming after a partial run: keep that run's numbering, derived from the first card it created.
if [ -z "$START_PHASE" ]; then
    for i in "${!FILES[@]}"; do
        FOUND=$(existing_phase_for "$(card_suffix "${FILES[$i]}")")
        if [ -n "$FOUND" ]; then
            START_PHASE=$(( FOUND - i ))
            echo "Some cards already exist → keeping their numbering, starting at Phase $START_PHASE"
            break
        fi
    done
fi

if [ -z "$START_PHASE" ]; then
    HIGHEST=$(printf '%s\n' "$EXISTING_TITLES" | awk '
        match(tolower($0), /phase[ \t]+[0-9]+/) {
            n = substr($0, RSTART, RLENGTH); gsub(/[^0-9]/, "", n)
            if (n + 0 > max) max = n + 0
        }
        END { print max + 0 }')
    START_PHASE=$(( HIGHEST + 1 ))
    echo "Highest existing phase: $HIGHEST → starting at Phase $START_PHASE"
fi

PROJECT_ID=""
STATUS_FIELD_ID=""
STATUS_OPTION_ID=""
if [ -n "$STATUS" ] && [ "$DRY_RUN" = false ]; then
    PROJECT_ID=$(gh project view "$PROJECT" --owner "$OWNER" --format json --jq '.id')
    STATUS_FIELD_ID=$(gh project field-list "$PROJECT" --owner "$OWNER" --format json \
        --jq '.fields[] | select(.name == "Status") | .id')
    STATUS_OPTION_ID=$(gh project field-list "$PROJECT" --owner "$OWNER" --format json \
        --jq ".fields[] | select(.name == \"Status\") | .options[] | select(.name == \"$STATUS\") | .id")
    if [ -z "$STATUS_OPTION_ID" ]; then
        echo "Status option \"$STATUS\" not found on the board." >&2
        exit 1
    fi
fi

for i in "${!FILES[@]}"; do
    FILE=${FILES[$i]}
    PHASE=$(( START_PHASE + i ))
    TITLE=$(head -1 "$FILE" | sed -e 's/^# //' -e "s/{N}/$PHASE/")
    BODY=$(tail -n +3 "$FILE")
    FOUND=$(existing_phase_for "$(card_suffix "$FILE")")
    if [ -n "$FOUND" ]; then
        echo "Already on the board as Phase $FOUND, skipping: $TITLE"
    elif [ "$DRY_RUN" = true ]; then
        echo "[dry-run] $TITLE"
    else
        ITEM_ID=$(gh project item-create "$PROJECT" --owner "$OWNER" \
            --title "$TITLE" --body "$BODY" --format json --jq '.id')
        if [ -n "$STATUS_OPTION_ID" ]; then
            gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" \
                --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_OPTION_ID" >/dev/null
        fi
        echo "Created: $TITLE"
    fi
done
