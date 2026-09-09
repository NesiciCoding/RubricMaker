/**
 * Four-corner document cropping for scans. A phone photo of paper is skewed and
 * surrounded by desk/background; isolating the page to a clean rectangle is the
 * single biggest OCR-quality win.
 *
 * The corner *detection* (edge-finding on a photo) is the heavy part — the scan route
 * lazy-loads jscanify + OpenCV.js (a ~8 MB WASM payload) for it, kept out of the main
 * bundle. That detector is injected into `autoCropDocument` as a `CornerDetector`, so
 * this module stays pure and unit-testable with the detector mocked, and the manual
 * four-corner adjust fallback reuses the exact same `cropQuadrilateral` unwarp.
 */

import type { RgbaImage } from '../types';
import { sampleBilinear } from './preprocessScan';

export interface Point {
    x: number;
    y: number;
}

export interface Corners {
    topLeft: Point;
    topRight: Point;
    bottomRight: Point;
    bottomLeft: Point;
}

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerpPoint(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Sort four arbitrary points into TL/TR/BR/BL. Ordering by angle around the centroid
 * gives the correct clockwise cycle for any convex quadrilateral (an x+y/x−y extrema
 * heuristic collapses on a ~45°-rotated quad, assigning one point to two corners); the
 * cycle is then rotated so the point nearest the origin becomes the top-left.
 */
export function orderCorners(points: Point[]): Corners {
    if (points.length !== 4) {
        throw new Error(`orderCorners expects exactly 4 points, got ${points.length}`);
    }
    let tl = points[0];
    for (const p of points) {
        if (p.x + p.y < tl.x + tl.y) tl = p;
    }
    const cx = points.reduce((s, p) => s + p.x, 0) / 4;
    const cy = points.reduce((s, p) => s + p.y, 0) / 4;
    const clockwise = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    const start = clockwise.indexOf(tl);
    const [topLeft, topRight, bottomRight, bottomLeft] = [0, 1, 2, 3].map((i) => clockwise[(start + i) % 4]);
    return { topLeft, topRight, bottomRight, bottomLeft };
}

function outputSize(corners: Corners, width?: number, height?: number): { width: number; height: number } {
    const w =
        width ??
        Math.max(distance(corners.topLeft, corners.topRight), distance(corners.bottomLeft, corners.bottomRight));
    const h =
        height ??
        Math.max(distance(corners.topLeft, corners.bottomLeft), distance(corners.topRight, corners.bottomRight));
    return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

export interface CropOptions {
    width?: number;
    height?: number;
    background?: number;
}

/**
 * Unwarp the quadrilateral `corners` of `img` into an axis-aligned rectangle via
 * bilinear corner interpolation. (The OpenCV auto path does a true projective warp;
 * this bilinear mapping is the dependency-free engine shared by the manual adjust.)
 */
export function cropQuadrilateral(img: RgbaImage, corners: Corners, opts: CropOptions = {}): RgbaImage {
    const { width, height } = outputSize(corners, opts.width, opts.height);
    const background = opts.background ?? 255;
    const out: RgbaImage = { data: new Uint8ClampedArray(width * height * 4), width, height };
    for (let y = 0; y < height; y++) {
        const v = height === 1 ? 0 : y / (height - 1);
        for (let x = 0; x < width; x++) {
            const u = width === 1 ? 0 : x / (width - 1);
            const top = lerpPoint(corners.topLeft, corners.topRight, u);
            const bottom = lerpPoint(corners.bottomLeft, corners.bottomRight, u);
            const src = lerpPoint(top, bottom, v);
            const [r, g, b, a] = sampleBilinear(img, src.x, src.y, background);
            const o = (y * width + x) * 4;
            out.data[o] = r;
            out.data[o + 1] = g;
            out.data[o + 2] = b;
            out.data[o + 3] = a;
        }
    }
    return out;
}

/** Detects the page's four corners in an image, or returns null when none are found. */
export type CornerDetector = (img: RgbaImage) => Promise<Corners | null> | Corners | null;

export interface AutoCropOptions extends CropOptions {
    /**
     * Page-corner detector. In the app this is the lazy-loaded jscanify/OpenCV wrapper
     * (added with the scan route); in tests it is mocked. Injecting it keeps the heavy
     * WASM dependency out of this module and out of the main bundle.
     */
    detectCorners: CornerDetector;
}

export interface AutoCropResult {
    image: RgbaImage;
    corners: Corners | null;
    /** False when detection found no page — the caller should offer the manual adjust. */
    cropped: boolean;
}

/**
 * Detect the page and unwarp it. When detection returns null (no confident page found),
 * the original image is returned with `cropped: false` so the caller can fall back to
 * the manual four-corner adjust.
 */
export async function autoCropDocument(img: RgbaImage, opts: AutoCropOptions): Promise<AutoCropResult> {
    const corners = await opts.detectCorners(img);
    if (!corners) {
        return { image: img, corners: null, cropped: false };
    }
    return {
        image: cropQuadrilateral(img, corners, opts),
        corners,
        cropped: true,
    };
}
