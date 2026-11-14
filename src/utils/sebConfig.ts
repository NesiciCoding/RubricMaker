import { saveAs } from 'file-saver';
import {
    normalizeAppBase,
    renderSebConfigBytes,
    sebFileSlug,
    sebQuitUrl,
} from '../../supabase/functions/_shared/sebConfig.ts';

function appBaseFromLocation(): string {
    return normalizeAppBase(`${window.location.origin}${window.location.pathname}`) ?? window.location.origin;
}

/**
 * SEB quits when it detects a navigation to the quit URL. A hash-only change is a same-document
 * navigation that never reaches SEB's request handler, so the quit URL must be a real document
 * load — a query on the app's own base path works on static/sub-path hosting.
 */
export function buildSebQuitUrl(): string {
    return sebQuitUrl(appBaseFromLocation());
}

export function isRunningInSEB(): boolean {
    return /SEB/i.test(navigator.userAgent);
}

/** Leaves the kiosk session; the URL must be the exact navigation the config declares. */
export function quitSafeExamBrowser(quitUrl: string): void {
    window.location.assign(quitUrl);
}

export interface SebConfigEndpoint {
    supabaseUrl: string;
    code: string;
    apikey?: string;
}

/** Fetches the server-built config blob for an assignment, or null when it can't serve one. */
async function fetchSebConfigBlob(endpoint: SebConfigEndpoint): Promise<Blob | null> {
    const base = endpoint.supabaseUrl.replace(/\/+$/, '');
    const url = `${base}/functions/v1/get-seb-config?code=${encodeURIComponent(endpoint.code)}`;
    try {
        const response = await fetch(url, {
            headers: endpoint.apikey
                ? { apikey: endpoint.apikey, Authorization: `Bearer ${endpoint.apikey}` }
                : undefined,
        });
        if (!response.ok) return null;
        return await response.blob();
    } catch {
        return null;
    }
}

/** Builds a locally generated `.seb` config blob that opens `startUrl` in Safe Exam Browser. */
function buildLocalSebConfigBlob(startUrl: string): Blob {
    return new Blob([renderSebConfigBytes({ startUrl, appBase: appBaseFromLocation() })], {
        type: 'application/octet-stream',
    });
}

/** Downloads a locally generated `.seb` file that opens `startUrl` in Safe Exam Browser. */
export function downloadSebConfig(startUrl: string, fileNameBase: string): void {
    saveAs(buildLocalSebConfigBlob(startUrl), `${sebFileSlug(fileNameBase, 'essay')}.seb`);
}

/**
 * Downloads the assignment's config, preferring the server so every device gets the same bytes,
 * and falling back to a locally generated file when the server is unreachable or the assignment
 * cannot serve a config.
 */
export async function downloadSebConfigForAssignment({
    endpoint,
    startUrl,
    fileName,
}: {
    endpoint?: SebConfigEndpoint;
    startUrl: string;
    fileName: string;
}): Promise<void> {
    const blob = endpoint ? await fetchSebConfigBlob(endpoint) : null;
    if (blob) {
        saveAs(blob, `${sebFileSlug(fileName, 'exam')}.seb`);
        return;
    }
    downloadSebConfig(startUrl, fileName);
}

/**
 * Prepares the assignment's config blob ahead of the click that downloads it: server config when
 * the endpoint answers, local config otherwise. Safari only allows `saveAs`'s underlying anchor
 * click inside the synchronous extent of a user gesture, and the server fetch above is async, so
 * callers that can prefetch (e.g. once the gate renders, well before the student clicks
 * "Download") should save the result and pass it to `saveSebConfigBlob` directly from the click
 * handler instead of awaiting this during the click.
 */
export async function prepareSebConfigBlob({
    endpoint,
    startUrl,
}: {
    endpoint?: SebConfigEndpoint;
    startUrl: string;
}): Promise<Blob> {
    const served = endpoint ? await fetchSebConfigBlob(endpoint) : null;
    return served ?? buildLocalSebConfigBlob(startUrl);
}

/** Saves an already-prepared config blob — call synchronously from the click handler. */
export function saveSebConfigBlob(blob: Blob, fileNameBase: string): void {
    saveAs(blob, `${sebFileSlug(fileNameBase, 'exam')}.seb`);
}
