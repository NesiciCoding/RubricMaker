/**
 * Pure, canvas-independent image preprocessing for scanned handwriting before OCR.
 * Tesseract accuracy hinges on a clean, level, high-contrast 1-bit image far more
 * than on the engine settings, so this chain — grayscale → contrast → deskew → upscale →
 * threshold — is the biggest quality lever in the scan pipeline. Thresholding runs last
 * so the bilinear geometric steps can't reintroduce intermediate gray values: the output
 * is a clean 1-bit image whenever `threshold` is enabled.
 *
 * Everything here operates on a plain {data,width,height} RGBA buffer (structurally
 * a DOM `ImageData`, so a real `ImageData` can be passed straight in) and returns a
 * new buffer, leaving the input untouched. The auto-crop step that needs OpenCV lives
 * in `documentCrop.ts`; keeping these transforms dependency-free makes them unit-testable
 * without a browser or WASM.
 */

import type { RgbaImage } from '../types';

export type { RgbaImage };

export interface PreprocessOptions {
    grayscale?: boolean;
    contrast?: boolean;
    threshold?: boolean;
    deskew?: boolean;
    /** Upscale so the smaller side reaches at least this many pixels (~300 DPI lever). */
    upscaleMinDimension?: number;
    /** Bound the deskew search so a genuinely rotated page isn't "corrected" into nonsense. */
    maxSkewDegrees?: number;
}

export const DEFAULT_PREPROCESS_OPTIONS: Required<Omit<PreprocessOptions, 'upscaleMinDimension'>> & {
    upscaleMinDimension: number;
} = {
    grayscale: true,
    contrast: true,
    threshold: true,
    deskew: true,
    upscaleMinDimension: 1000,
    maxSkewDegrees: 10,
};

function cloneImage(img: RgbaImage): RgbaImage {
    return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

export function luminance(r: number, g: number, b: number): number {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Collapse to a gray image (r=g=b=luma), preserving alpha. */
export function toGrayscale(img: RgbaImage): RgbaImage {
    const out = cloneImage(img);
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
        const y = luminance(d[i], d[i + 1], d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = y;
    }
    return out;
}

function grayHistogram(img: RgbaImage): number[] {
    const hist = new Array<number>(256).fill(0);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        hist[Math.round(luminance(d[i], d[i + 1], d[i + 2]))]++;
    }
    return hist;
}

/**
 * Linear contrast stretch clamped to the 2nd/98th luminance percentiles so a few
 * stray black/white pixels (ink specks, glare) don't flatten the useful range.
 */
export function stretchContrast(img: RgbaImage): RgbaImage {
    const hist = grayHistogram(img);
    const total = (img.data.length / 4) | 0;
    if (total === 0) return cloneImage(img);

    const lowCut = total * 0.02;
    const highCut = total * 0.02;
    let lo = 0;
    let hi = 255;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc > lowCut) {
            lo = v;
            break;
        }
    }
    acc = 0;
    for (let v = 255; v >= 0; v--) {
        acc += hist[v];
        if (acc > highCut) {
            hi = v;
            break;
        }
    }
    const out = cloneImage(img);
    if (hi <= lo) return out;
    const scale = 255 / (hi - lo);
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            d[i + c] = (d[i + c] - lo) * scale;
        }
    }
    return out;
}

/** Otsu's method: the luminance threshold that maximises between-class variance. */
export function otsuThreshold(img: RgbaImage): number {
    const hist = grayHistogram(img);
    const total = img.data.length / 4;
    if (total === 0) return 127;

    let sum = 0;
    for (let v = 0; v < 256; v++) sum += v * hist[v];

    let sumB = 0;
    let wB = 0;
    let maxVar = -1;
    let threshold = 127;
    for (let v = 0; v < 256; v++) {
        wB += hist[v];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += v * hist[v];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > maxVar) {
            maxVar = between;
            threshold = v;
        }
    }
    return threshold;
}

/** Binarise to black (0) / white (255) at `threshold` (defaults to Otsu). */
export function binarize(img: RgbaImage, threshold = otsuThreshold(img)): RgbaImage {
    const out = cloneImage(img);
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
        const v = luminance(d[i], d[i + 1], d[i + 2]) <= threshold ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = v;
    }
    return out;
}

export function sampleBilinear(
    img: RgbaImage,
    x: number,
    y: number,
    background = 255
): [number, number, number, number] {
    if (x < 0 || y < 0 || x > img.width - 1 || y > img.height - 1) {
        return [background, background, background, 255];
    }
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, img.width - 1);
    const y1 = Math.min(y0 + 1, img.height - 1);
    const fx = x - x0;
    const fy = y - y0;
    const d = img.data;
    const idx = (px: number, py: number) => (py * img.width + px) * 4;
    const out: [number, number, number, number] = [0, 0, 0, 255];
    for (let c = 0; c < 4; c++) {
        const top = d[idx(x0, y0) + c] * (1 - fx) + d[idx(x1, y0) + c] * fx;
        const bot = d[idx(x0, y1) + c] * (1 - fx) + d[idx(x1, y1) + c] * fx;
        out[c] = top * (1 - fy) + bot * fy;
    }
    return out;
}

/** Rotate around the image centre by `degrees` (positive = clockwise), keeping size. */
export function rotateImage(img: RgbaImage, degrees: number, background = 255): RgbaImage {
    const { width, height } = img;
    const out: RgbaImage = { data: new Uint8ClampedArray(width * height * 4), width, height };
    const rad = (degrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const srcX = cx + dx * cos + dy * sin;
            const srcY = cy - dx * sin + dy * cos;
            const [r, g, b, a] = sampleBilinear(img, srcX, srcY, background);
            const o = (y * width + x) * 4;
            out.data[o] = r;
            out.data[o + 1] = g;
            out.data[o + 2] = b;
            out.data[o + 3] = a;
        }
    }
    return out;
}

function projectionVariance(img: RgbaImage, degrees: number): number {
    const rotated = degrees === 0 ? img : rotateImage(img, degrees, 255);
    const { width, height } = rotated;
    const d = rotated.data;
    const rowInk = new Float64Array(height);
    for (let y = 0; y < height; y++) {
        let ink = 0;
        for (let x = 0; x < width; x++) {
            ink += 255 - luminance(d[(y * width + x) * 4], d[(y * width + x) * 4 + 1], d[(y * width + x) * 4 + 2]);
        }
        rowInk[y] = ink;
    }
    let mean = 0;
    for (let y = 0; y < height; y++) mean += rowInk[y];
    mean /= height;
    let variance = 0;
    for (let y = 0; y < height; y++) variance += (rowInk[y] - mean) * (rowInk[y] - mean);
    return variance / height;
}

/**
 * Estimate the correction angle via projection-profile variance: when text lines are
 * level the per-row ink totals spike on text rows and drop between them, maximising
 * variance. Returns the degrees to rotate the image by so its text becomes level
 * (positive = clockwise), i.e. the negation of the page's own skew.
 */
export function estimateSkewAngle(img: RgbaImage, maxDegrees = 10, step = 0.5): number {
    let best = 0;
    let bestScore = -1;
    for (let angle = -maxDegrees; angle <= maxDegrees + 1e-9; angle += step) {
        const score = projectionVariance(img, angle);
        if (score > bestScore) {
            bestScore = score;
            best = angle;
        }
    }
    return best;
}

/** Detect and correct text skew within ±maxDegrees. */
export function deskew(img: RgbaImage, maxDegrees = 10): RgbaImage {
    const angle = estimateSkewAngle(img, maxDegrees);
    if (angle === 0) return cloneImage(img);
    return rotateImage(img, angle, 255);
}

/** Bilinear resize to exact target dimensions. */
export function resize(img: RgbaImage, targetWidth: number, targetHeight: number): RgbaImage {
    const w = Math.max(1, Math.round(targetWidth));
    const h = Math.max(1, Math.round(targetHeight));
    const out: RgbaImage = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    const sx = img.width / w;
    const sy = img.height / h;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Clamp to source bounds so the edge row/column replicate edge pixels
            // instead of sampling the background past width-1 / height-1.
            const srcX = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), img.width - 1);
            const srcY = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), img.height - 1);
            const [r, g, b, a] = sampleBilinear(img, srcX, srcY, 255);
            const o = (y * w + x) * 4;
            out.data[o] = r;
            out.data[o + 1] = g;
            out.data[o + 2] = b;
            out.data[o + 3] = a;
        }
    }
    return out;
}

/** Upscale (never downscale) so the smaller side reaches `minDimension`. */
export function upscaleToMinDimension(img: RgbaImage, minDimension: number): RgbaImage {
    const smaller = Math.min(img.width, img.height);
    if (smaller <= 0 || smaller >= minDimension) return cloneImage(img);
    const factor = minDimension / smaller;
    return resize(img, img.width * factor, img.height * factor);
}

/** Run the enabled preprocessing steps in order and return a new image. */
export function preprocessScan(img: RgbaImage, opts: PreprocessOptions = {}): RgbaImage {
    const o = { ...DEFAULT_PREPROCESS_OPTIONS, ...opts };
    let result = cloneImage(img);
    if (o.grayscale) result = toGrayscale(result);
    if (o.contrast) result = stretchContrast(result);
    // Geometric steps use bilinear interpolation, so threshold last to keep 1-bit output.
    if (o.deskew) result = deskew(result, o.maxSkewDegrees);
    if (o.upscaleMinDimension > 0) result = upscaleToMinDimension(result, o.upscaleMinDimension);
    if (o.threshold) result = binarize(result);
    return result;
}
