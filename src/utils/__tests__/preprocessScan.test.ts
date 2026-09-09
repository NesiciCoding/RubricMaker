import { describe, it, expect } from 'vitest';
import {
    type RgbaImage,
    luminance,
    toGrayscale,
    stretchContrast,
    otsuThreshold,
    binarize,
    rotateImage,
    estimateSkewAngle,
    deskew,
    resize,
    upscaleToMinDimension,
    preprocessScan,
} from '../preprocessScan';

function makeImage(
    width: number,
    height: number,
    fn: (x: number, y: number) => [number, number, number, number]
): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const [r, g, b, a] = fn(x, y);
            const o = (y * width + x) * 4;
            data[o] = r;
            data[o + 1] = g;
            data[o + 2] = b;
            data[o + 3] = a;
        }
    }
    return { data, width, height };
}

const gray = (v: number): [number, number, number, number] => [v, v, v, 255];

/** White page with evenly spaced fully-black horizontal "text" rows. */
function levelLines(width = 40, height = 40): RgbaImage {
    return makeImage(width, height, (_x, y) => (y % 6 < 2 ? gray(0) : gray(255)));
}

describe('luminance', () => {
    it('weights channels per Rec. 601', () => {
        expect(luminance(255, 255, 255)).toBeCloseTo(255);
        expect(luminance(0, 0, 0)).toBe(0);
        expect(luminance(255, 0, 0)).toBeCloseTo(76.245, 2);
    });
});

describe('toGrayscale', () => {
    it('sets r=g=b to the luminance and preserves alpha and size', () => {
        const img = makeImage(2, 1, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 255, 128]));
        const out = toGrayscale(img);
        expect(out.width).toBe(2);
        expect(out.data[0]).toBe(out.data[1]);
        expect(out.data[1]).toBe(out.data[2]);
        expect(out.data[7]).toBe(128); // alpha preserved
    });

    it('does not mutate the input', () => {
        const img = makeImage(1, 1, () => [255, 0, 0, 255]);
        const copy = new Uint8ClampedArray(img.data);
        toGrayscale(img);
        expect(img.data).toEqual(copy);
    });
});

describe('stretchContrast', () => {
    it('expands a compressed luminance range toward 0..255', () => {
        const img = makeImage(10, 1, (x) => gray(100 + x * 5)); // 100..145
        const out = stretchContrast(img);
        const values = [...Array(10)].map((_, x) => out.data[x * 4]);
        expect(Math.min(...values)).toBeLessThan(60);
        expect(Math.max(...values)).toBeGreaterThan(200);
    });
});

describe('otsuThreshold / binarize', () => {
    it('finds a threshold between two clusters and splits them', () => {
        const img = makeImage(10, 1, (x) => gray(x < 5 ? 40 : 210));
        const t = otsuThreshold(img);
        expect(t).toBeGreaterThanOrEqual(40);
        expect(t).toBeLessThan(210);
        const bin = binarize(img, t);
        expect(bin.data[0]).toBe(0); // dark cluster -> black
        expect(bin.data[9 * 4]).toBe(255); // light cluster -> white
    });
});

describe('rotateImage', () => {
    it('is an identity at 0 degrees', () => {
        const img = levelLines();
        const out = rotateImage(img, 0);
        expect(out.data).toEqual(img.data);
    });

    it('keeps dimensions when rotating', () => {
        const img = levelLines();
        const out = rotateImage(img, 5);
        expect(out.width).toBe(img.width);
        expect(out.height).toBe(img.height);
    });
});

describe('estimateSkewAngle / deskew', () => {
    it('reports zero skew for level text lines', () => {
        expect(estimateSkewAngle(levelLines())).toBeCloseTo(0, 1);
    });

    it('detects an introduced rotation and corrects most of it', () => {
        const tilted = rotateImage(levelLines(60, 60), 4);
        // A +4° page needs a ~-4° correction to level it.
        const angle = estimateSkewAngle(tilted, 10);
        expect(Math.abs(angle)).toBeGreaterThan(1.5);
        expect(Math.abs(angle)).toBeLessThan(6.5);

        const residualBefore = Math.abs(estimateSkewAngle(tilted, 10));
        const residualAfter = Math.abs(estimateSkewAngle(deskew(tilted, 10), 10));
        expect(residualAfter).toBeLessThan(residualBefore);
    });
});

describe('resize / upscaleToMinDimension', () => {
    it('resizes to the requested dimensions', () => {
        const out = resize(levelLines(20, 20), 40, 10);
        expect(out.width).toBe(40);
        expect(out.height).toBe(10);
    });

    it('upscales so the smaller side reaches the minimum', () => {
        const out = upscaleToMinDimension(
            makeImage(50, 20, () => gray(128)),
            100
        );
        expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(100);
        expect(out.width / out.height).toBeCloseTo(50 / 20, 1);
    });

    it('leaves an already-large image unchanged', () => {
        const img = makeImage(200, 200, () => gray(128));
        const out = upscaleToMinDimension(img, 100);
        expect(out.width).toBe(200);
        expect(out.height).toBe(200);
    });
});

describe('preprocessScan', () => {
    it('runs the full chain, upscales, and does not mutate the input', () => {
        const img = makeImage(60, 60, (x, y) => gray((x + y) % 6 < 2 ? 60 : 200));
        const copy = new Uint8ClampedArray(img.data);
        const out = preprocessScan(img, { upscaleMinDimension: 120 });
        expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(120);
        expect(img.data).toEqual(copy);
    });

    it('honours disabled steps (no upscale, no threshold)', () => {
        const img = makeImage(30, 30, () => gray(123));
        const out = preprocessScan(img, {
            grayscale: true,
            contrast: false,
            threshold: false,
            deskew: false,
            upscaleMinDimension: 0,
        });
        expect(out.width).toBe(30);
        expect(out.height).toBe(30);
    });

    it('produces a binary image when thresholding is on', () => {
        const img = makeImage(20, 20, (x) => gray(x < 10 ? 30 : 220));
        const out = preprocessScan(img, { deskew: false, upscaleMinDimension: 0 });
        const distinct = new Set([...out.data.filter((_, i) => i % 4 === 0)]);
        for (const v of distinct) expect([0, 255]).toContain(v);
    });

    it('stays 1-bit after the default deskew and upscale steps', () => {
        // Threshold runs last, so bilinear deskew/upscale can't reintroduce gray values.
        const img = makeImage(40, 40, (x, y) => gray((x + y) % 6 < 2 ? 30 : 220));
        const out = preprocessScan(img, { upscaleMinDimension: 80 });
        const distinct = new Set([...out.data.filter((_, i) => i % 4 === 0)]);
        for (const v of distinct) expect([0, 255]).toContain(v);
    });
});
