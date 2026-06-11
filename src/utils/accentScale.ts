export const ACCENT_SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export type AccentScaleStep = (typeof ACCENT_SCALE_STEPS)[number];

export type AccentScale = Record<AccentScaleStep, string>;

/**
 * Builds a 10-step tonal scale (50–900) from a base accent color using CSS
 * color-mix() in oklab. Steps below 500 mix toward white, steps above mix
 * toward black; 500 is the accent itself.
 */
export function buildAccentScale(accent: string): AccentScale {
    const scale = {} as AccentScale;
    for (const step of ACCENT_SCALE_STEPS) {
        if (step === 500) {
            scale[step] = accent;
        } else if (step < 500) {
            const whiteAmount = Math.round(((500 - step) / 450) * 90);
            scale[step] = `color-mix(in oklab, ${accent} ${100 - whiteAmount}%, white ${whiteAmount}%)`;
        } else {
            const blackAmount = Math.round(((step - 500) / 400) * 80);
            scale[step] = `color-mix(in oklab, ${accent} ${100 - blackAmount}%, black ${blackAmount}%)`;
        }
    }
    return scale;
}
