#!/bin/bash
# Helpers shared by export-cloud.sh and import-cloud.sh for copying Storage objects.

# Percent-encodes an object name for a Storage API URL, keeping "/" as the path separator.
#
# The value is walked byte by byte (via od) rather than character by character: taking one
# character at a time and formatting it as a byte breaks on multi-byte UTF-8 under the bash 3.2
# that ships with macOS, which used to emit garbage such as "FC3FA9" instead of "%C3%A9" for "é".
urlencode_path() {
    local bytes out="" i byte
    bytes=$(printf '%s' "$1" | LC_ALL=C od -An -tx1 -v | tr -d '[:space:]' | tr 'a-f' 'A-F')
    for ((i = 0; i < ${#bytes}; i += 2)); do
        byte="${bytes:i:2}"
        case "$byte" in
            2F) out+="/" ;;                                                          # path separator
            2D|2E|5F|7E|3[0-9]|4[1-9A-F]|5[0-9A]|6[1-9A-F]|7[0-9A])
                out+=$(LC_ALL=C printf "\\x$byte")                                    # unreserved
                ;;
            *) out+="%$byte" ;;
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
