/**
 * Tesseract's worker, WASM core and language data are fetched on first use, so starting the
 * engine fails without a network connection (or behind a firewall that blocks the CDN).
 */
export class OcrUnavailableError extends Error {
    constructor(cause?: unknown) {
        super('The text-recognition engine could not be loaded.', { cause });
        this.name = 'OcrUnavailableError';
    }
}
