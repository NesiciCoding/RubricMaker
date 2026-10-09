#!/bin/bash
# Helpers shared by export-cloud.sh and import-cloud.sh for copying Storage objects.

# Percent-encodes an object name for a Storage API URL, keeping "/" as the path separator.
urlencode_path() {
    local LC_ALL=C
    local s="$1" out="" c i
    for ((i = 0; i < ${#s}; i++)); do
        c="${s:i:1}"
        case "$c" in
            [A-Za-z0-9._~/-]) out+="$c" ;;
            *)
                printf -v c '%%%02X' "'$c"
                out+="${c: -3}"
                ;;
        esac
    done
    printf '%s' "$out"
}

# Bucket ids are plain names (Storage allows dots); object names must stay inside the bucket's folder on disk.
is_safe_object() {
    local bucket="$1" name="$2"
    [[ "$bucket" =~ ^[A-Za-z0-9._-]+$ && "$bucket" != "." && "$bucket" != ".." ]] || return 1
    [[ -n "$name" && "$name" != /* ]] || return 1
    [[ "/$name/" != */../* && "/$name/" != */./* && "$name" != *//* ]] || return 1
    return 0
}
