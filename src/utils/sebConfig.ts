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

/** Downloads a locally generated `.seb` file that opens `startUrl` in Safe Exam Browser. */
export function downloadSebConfig(startUrl: string, fileNameBase: string): void {
    const blob = new Blob([renderSebConfigBytes({ startUrl, appBase: appBaseFromLocation() })], {
        type: 'application/octet-stream',
    });
    saveAs(blob, `${sebFileSlug(fileNameBase, 'essay')}.seb`);
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
    if (endpoint) {
        const base = endpoint.supabaseUrl.replace(/\/+$/, '');
        const url = `${base}/functions/v1/get-seb-config?code=${encodeURIComponent(endpoint.code)}`;
        try {
            const response = await fetch(url, {
                headers: endpoint.apikey
                    ? { apikey: endpoint.apikey, Authorization: `Bearer ${endpoint.apikey}` }
                    : undefined,
            });
            if (response.ok) {
                saveAs(await response.blob(), `${sebFileSlug(fileName, 'exam')}.seb`);
                return;
            }
        } catch {
            // Offline, or a deployment without the edge runtime: use the local config instead.
        }
    }
    downloadSebConfig(startUrl, fileName);
}
