// Safe Exam Browser (.seb) settings for an assignment.
//
// Shared by the browser bundle and the get-seb-config edge function so the same assignment
// produces byte-identical files no matter which device asks for the config.

export type SebAssignmentKind = 'test' | 'essay';

/** Canonical app base: origin plus path, no trailing slash, no index.html. */
export function normalizeAppBase(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const path = url.pathname.replace(/\/index\.html?$/i, '').replace(/\/+$/, '');
    return `${url.origin}${path}`;
}

/** A real document navigation: SEB does not detect a hash-only change as a quit. */
export function sebQuitUrl(appBase: string): string {
    return `${appBase}/?seb-done=1`;
}

/** The student-facing link this config must start; matches the app's hash routes. */
export function sebStartUrl(appBase: string, kind: SebAssignmentKind, code: string): string {
    const route = kind === 'essay' ? 'essay' : 'test';
    return `${appBase}/#/${route}/${encodeURIComponent(code)}`;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** File name for a downloaded config: lowercase ASCII slug, with a fallback when nothing survives. */
export function sebFileSlug(value: string | null | undefined, fallback: string): string {
    const slug = (value ?? '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || fallback;
}

/** Builds the settings plist for one assignment. */
export function renderSebConfigXml({ startUrl, appBase }: { startUrl: string; appBase: string }): string {
    const quitUrl = escapeXml(sebQuitUrl(appBase));
    const filterExpression = escapeXml(`${appBase}/.*`);
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>startURL</key>
\t<string>${escapeXml(startUrl)}</string>
\t<key>allowQuit</key>
\t<false/>
\t<key>quitURL</key>
\t<string>${quitUrl}</string>
\t<key>quitURLConfirm</key>
\t<false/>
\t<key>browserWindowAllowAddressBar</key>
\t<false/>
\t<key>URLFilterEnable</key>
\t<true/>
\t<key>URLFilterEnableContentFilter</key>
\t<false/>
\t<key>URLFilterRules</key>
\t<array>
\t\t<dict>
\t\t\t<key>action</key>
\t\t\t<integer>1</integer>
\t\t\t<key>active</key>
\t\t\t<true/>
\t\t\t<key>expression</key>
\t\t\t<string>${filterExpression}</string>
\t\t\t<key>regex</key>
\t\t\t<false/>
\t\t</dict>
\t</array>
</dict>
</plist>`;
}

// SEB requires a .seb to be a gzip archive containing a 4-byte block prefix ("plnd" for plain
// data) followed by the gzip-compressed plist. Stored deflate blocks keep the output
// deterministic, so the same assignment hashes to the same bytes on every platform.
const GZIP_HEADER = [0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff];

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
    if (crcTable) return crcTable;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    crcTable = table;
    return table;
}

function crc32(bytes: Uint8Array): number {
    const table = getCrcTable();
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function gzipStored(data: Uint8Array): Uint8Array<ArrayBuffer> {
    const blocks = Math.max(1, Math.ceil(data.length / 0xffff));
    const out = new Uint8Array(GZIP_HEADER.length + data.length + blocks * 5 + 8);
    let offset = 0;
    out.set(GZIP_HEADER, offset);
    offset += GZIP_HEADER.length;
    for (let block = 0; block < blocks; block += 1) {
        const start = block * 0xffff;
        const chunk = data.subarray(start, Math.min(start + 0xffff, data.length));
        const isLast = block === blocks - 1;
        out[offset] = isLast ? 0x01 : 0x00;
        out[offset + 1] = chunk.length & 0xff;
        out[offset + 2] = (chunk.length >>> 8) & 0xff;
        out[offset + 3] = ~chunk.length & 0xff;
        out[offset + 4] = (~chunk.length >>> 8) & 0xff;
        offset += 5;
        out.set(chunk, offset);
        offset += chunk.length;
    }
    const checksum = crc32(data);
    const size = data.length >>> 0;
    out[offset] = checksum & 0xff;
    out[offset + 1] = (checksum >>> 8) & 0xff;
    out[offset + 2] = (checksum >>> 16) & 0xff;
    out[offset + 3] = (checksum >>> 24) & 0xff;
    out[offset + 4] = size & 0xff;
    out[offset + 5] = (size >>> 8) & 0xff;
    out[offset + 6] = (size >>> 16) & 0xff;
    out[offset + 7] = (size >>> 24) & 0xff;
    return out;
}

/** Builds the bytes of a spec-compliant .seb file for one assignment. */
export function renderSebConfigBytes({
    startUrl,
    appBase,
}: {
    startUrl: string;
    appBase: string;
}): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    const compressedXml = gzipStored(encoder.encode(renderSebConfigXml({ startUrl, appBase })));
    const block = new Uint8Array(4 + compressedXml.length);
    block.set(encoder.encode('plnd'), 0);
    block.set(compressedXml, 4);
    return gzipStored(block);
}
