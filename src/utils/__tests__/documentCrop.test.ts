import { describe, it, expect, vi } from 'vitest';
import { type RgbaImage } from '../preprocessScan';
import { type Corners, orderCorners, cropQuadrilateral, autoCropDocument } from '../documentCrop';

function makeImage(width: number, height: number, fn: (x: number, y: number) => number): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const v = fn(x, y);
            const o = (y * width + x) * 4;
            data[o] = data[o + 1] = data[o + 2] = v;
            data[o + 3] = 255;
        }
    }
    return { data, width, height };
}

const rightHalfWhite = (size = 8) => makeImage(size, size, (x) => (x >= size / 2 ? 255 : 0));

describe('orderCorners', () => {
    it('assigns shuffled points to TL/TR/BR/BL', () => {
        const tl = { x: 1, y: 1 };
        const tr = { x: 9, y: 0 };
        const br = { x: 10, y: 8 };
        const bl = { x: 0, y: 9 };
        const c = orderCorners([br, bl, tr, tl]);
        expect(c.topLeft).toEqual(tl);
        expect(c.topRight).toEqual(tr);
        expect(c.bottomRight).toEqual(br);
        expect(c.bottomLeft).toEqual(bl);
    });

    it('throws on the wrong number of points', () => {
        expect(() => orderCorners([{ x: 0, y: 0 }])).toThrow();
    });
});

describe('cropQuadrilateral', () => {
    it('unwarps an axis-aligned sub-rectangle to its contents', () => {
        const img = rightHalfWhite(8);
        const corners: Corners = {
            topLeft: { x: 4, y: 0 },
            topRight: { x: 7, y: 0 },
            bottomRight: { x: 7, y: 7 },
            bottomLeft: { x: 4, y: 7 },
        };
        const out = cropQuadrilateral(img, corners);
        // Every sampled pixel comes from the white half.
        for (let i = 0; i < out.data.length; i += 4) {
            expect(out.data[i]).toBeGreaterThan(250);
        }
    });

    it('honours a requested output size', () => {
        const img = rightHalfWhite(8);
        const corners = orderCorners([
            { x: 4, y: 0 },
            { x: 7, y: 0 },
            { x: 7, y: 7 },
            { x: 4, y: 7 },
        ]);
        const out = cropQuadrilateral(img, corners, { width: 20, height: 12 });
        expect(out.width).toBe(20);
        expect(out.height).toBe(12);
    });

    it('derives output size from corner distances when unspecified', () => {
        const img = makeImage(20, 20, () => 128);
        const corners: Corners = {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 10, y: 0 },
            bottomRight: { x: 10, y: 6 },
            bottomLeft: { x: 0, y: 6 },
        };
        const out = cropQuadrilateral(img, corners);
        expect(out.width).toBe(10);
        expect(out.height).toBe(6);
    });
});

describe('autoCropDocument', () => {
    it('crops using the detected corners', async () => {
        const img = rightHalfWhite(8);
        const detectCorners = vi.fn().mockResolvedValue({
            topLeft: { x: 4, y: 0 },
            topRight: { x: 7, y: 0 },
            bottomRight: { x: 7, y: 7 },
            bottomLeft: { x: 4, y: 7 },
        } satisfies Corners);
        const result = await autoCropDocument(img, { detectCorners });
        expect(detectCorners).toHaveBeenCalledWith(img);
        expect(result.cropped).toBe(true);
        expect(result.corners).not.toBeNull();
        for (let i = 0; i < result.image.data.length; i += 4) {
            expect(result.image.data[i]).toBeGreaterThan(250);
        }
    });

    it('returns the original image and cropped=false when no page is detected', async () => {
        const img = rightHalfWhite(8);
        const result = await autoCropDocument(img, { detectCorners: () => null });
        expect(result.cropped).toBe(false);
        expect(result.corners).toBeNull();
        expect(result.image).toBe(img);
    });

    it('supports a synchronous detector', async () => {
        const img = rightHalfWhite(8);
        const corners: Corners = {
            topLeft: { x: 4, y: 0 },
            topRight: { x: 7, y: 0 },
            bottomRight: { x: 7, y: 7 },
            bottomLeft: { x: 4, y: 7 },
        };
        const result = await autoCropDocument(img, { detectCorners: () => corners, width: 5, height: 5 });
        expect(result.cropped).toBe(true);
        expect(result.image.width).toBe(5);
        expect(result.image.height).toBe(5);
    });
});
