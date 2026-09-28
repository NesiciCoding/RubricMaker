import { describe, it, expect, vi, afterEach } from 'vitest';
import { imageSourceToRgbaImage, rgbaImageToDataUrl } from './rgbaImageCanvas';

function stubCanvas(imageData: unknown) {
    const ctx = {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => imageData),
        putImageData: vi.fn(),
        canvas: { toDataURL: vi.fn(() => 'data:image/png;base64,cropped') },
    };
    vi.spyOn(document, 'createElement').mockReturnValue({
        width: 0,
        height: 0,
        getContext: () => ctx,
        toDataURL: ctx.canvas.toDataURL,
    } as unknown as HTMLCanvasElement);
    return ctx;
}

describe('imageSourceToRgbaImage', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('draws a decoded blob onto a canvas sized to the bitmap and reads its pixels', async () => {
        const fakeImageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
        const ctx = stubCanvas(fakeImageData);
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn(async () => ({ width: 2, height: 2 }))
        );
        vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });

        const result = await imageSourceToRgbaImage(new Blob(['x']));

        expect(ctx.drawImage).toHaveBeenCalled();
        expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
        expect(result).toBe(fakeImageData);
    });
});

describe('rgbaImageToDataUrl', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('paints the pixels onto a canvas and returns its data URL', () => {
        const ctx = stubCanvas(null);
        vi.stubGlobal(
            'ImageData',
            class {
                constructor(
                    public data: Uint8ClampedArray,
                    public width: number,
                    public height: number
                ) {}
            }
        );
        const img = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
        const url = rgbaImageToDataUrl(img);
        expect(ctx.putImageData).toHaveBeenCalled();
        expect(url).toBe('data:image/png;base64,cropped');
    });
});
