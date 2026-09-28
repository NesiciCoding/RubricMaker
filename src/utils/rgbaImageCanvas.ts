/**
 * The only browser-canvas-dependent glue between a captured photo (Blob/data URL) and the pure,
 * unit-testable `RgbaImage` pixel pipeline (preprocessScan.ts, documentCrop.ts, examScanRegions.ts)
 * — everything downstream of this file operates on plain RGBA buffers so it can be tested without
 * a browser. `RgbaImage` is structurally identical to DOM `ImageData`, so no data copying is needed
 * beyond what canvas itself requires.
 */

import type { RgbaImage } from '../types';

function canvasContext(width: number, height: number): CanvasRenderingContext2D {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    return ctx;
}

/** Decode an image Blob/data URL into pixels via an offscreen canvas. */
export async function imageSourceToRgbaImage(source: Blob | string): Promise<RgbaImage> {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    try {
        const bitmap = await createImageBitmap(typeof source === 'string' ? await (await fetch(url)).blob() : source);
        const ctx = canvasContext(bitmap.width, bitmap.height);
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    } finally {
        if (typeof source !== 'string') URL.revokeObjectURL(url);
    }
}

/** Encode pixels back to a data URL, e.g. to hand a cropped answer region to `recognizeImage`. */
export function rgbaImageToDataUrl(img: RgbaImage, mimeType = 'image/png'): string {
    const ctx = canvasContext(img.width, img.height);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    return ctx.canvas.toDataURL(mimeType);
}
