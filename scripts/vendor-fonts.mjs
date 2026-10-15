#!/usr/bin/env node
/**
 * Vendors the app's web fonts into `public/fonts/` so that no page load and no print iframe calls out
 * to fonts.googleapis.com (#701). Schools asked about the third-party request, and a print started
 * before an external font arrived came out in a fallback face.
 *
 * Run after changing the font list below:
 *
 *     node scripts/vendor-fonts.mjs
 *
 * Each family is requested as a `wght` *range* where it is a variable font, so one file serves every
 * weight the UI asks for instead of one file per weight. Static families fall back to their discrete
 * weights. Only the `latin` subset of the `normal` (upright) faces is kept: Google's latin subset
 * already covers the accented letters of the five UI languages (en/nl/de/fr/es), and every extra
 * subset would be another file in the repo and in the PWA cache. Re-run the script to refresh the
 * files when Google publishes new font versions — the generated `public/fonts/fonts.css` is what the
 * app links.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Without a modern browser UA, Google serves legacy TTF/woff instead of woff2.
const CHROME_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Every family the app can render: the boot/UI fonts from index.html, the UI font options in
 * AppContext, and the decorative fonts the export style templates and rubric formats offer.
 * `range` is used when the family is variable, `weights` otherwise.
 */
const FAMILIES = [
    {
        family: 'Bricolage Grotesque',
        range: 'opsz,wght@12..96,500..700',
        weights: 'opsz,wght@12..96,500;12..96,600;12..96,700',
    },
    { family: 'Hanken Grotesk', range: 'wght@400..700', weights: 'wght@400;500;600;700' },
    { family: 'Inter', range: 'wght@300..700', weights: 'wght@300;400;500;600;700' },
    { family: 'Nunito', range: 'wght@400..700', weights: 'wght@400;500;600;700' },
    { family: 'Source Sans 3', range: 'wght@400..700', weights: 'wght@400;500;600;700' },
    { family: 'Lato', weights: 'wght@400;700' },
    { family: 'Roboto', range: 'wght@400..700', weights: 'wght@400;500;700' },
    { family: 'Playfair Display', range: 'wght@400..700', weights: 'wght@400;700' },
    { family: 'Oswald', range: 'wght@400..700', weights: 'wght@400;500;700' },
    { family: 'Bebas Neue', weights: '' },
    { family: 'Special Elite', weights: '' },
    { family: 'Courier Prime', weights: 'wght@400;700' },
];

const OUT_DIR = path.join(process.cwd(), 'public', 'fonts');

const slug = (name) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

/** `400` -> `400`, variable range `400 700` -> `400_700`. */
const weightSlug = (weight) => weight.trim().replace(/\s+/g, '_');

async function fetchCss(query) {
    const url = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
    const response = await fetch(url, { headers: { 'User-Agent': CHROME_UA } });
    return response.ok ? response.text() : null;
}

async function fetchBinary(url) {
    const response = await fetch(url, { headers: { 'User-Agent': CHROME_UA } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    return Buffer.from(await response.arrayBuffer());
}

/** The latin, upright faces of a css2 response, as `[{ weight, unicodeRange, url }]`. */
function latinFaces(css) {
    return [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)]
        .filter(([, subset]) => subset === 'latin')
        .map(([, , body]) => ({
            style: /font-style:\s*([^;]+);/.exec(body)?.[1].trim(),
            weight: /font-weight:\s*([^;]+);/.exec(body)?.[1].trim(),
            url: /url\((https:[^)]+\.woff2)\)/.exec(body)?.[1],
            unicodeRange: /unicode-range:\s*([^;]+);/.exec(body)?.[1].trim(),
        }))
        .filter((face) => face.style === 'normal' && face.weight && face.url && face.unicodeRange);
}

async function main() {
    // Start clean so a family whose subsetting changed doesn't leave orphaned .woff2 files behind.
    await mkdir(OUT_DIR, { recursive: true });
    for (const entry of await readdir(OUT_DIR)) {
        if (entry.endsWith('.woff2')) await rm(path.join(OUT_DIR, entry));
    }

    const faces = [];
    const downloaded = new Map();
    let bytes = 0;

    for (const { family, range, weights } of FAMILIES) {
        // A family that isn't variable rejects the range query with a 400, which is the signal to
        // fall back to the discrete weights.
        const css =
            (range ? await fetchCss(`${family.replace(/ /g, '+')}:${range}`) : null) ??
            (await fetchCss(`${family.replace(/ /g, '+')}:${weights}`)) ??
            (await fetchCss(family.replace(/ /g, '+')));
        if (!css) throw new Error(`Google Fonts has no CSS for ${family}`);

        const familyFaces = latinFaces(css);
        if (familyFaces.length === 0) throw new Error(`No latin upright @font-face for ${family}`);

        for (const { weight, url, unicodeRange } of familyFaces) {
            // Variable families return one shared file for every weight; download it once.
            let file = downloaded.get(url);
            if (!file) {
                file = `${slug(family)}-${weightSlug(weight)}.woff2`;
                const data = await fetchBinary(url);
                await writeFile(path.join(OUT_DIR, file), data);
                downloaded.set(url, file);
                bytes += data.byteLength;
                console.log(`${file.padEnd(38)} ${(data.byteLength / 1024).toFixed(1)} KB`);
            }
            faces.push({ family, weight, unicodeRange, file });
        }
    }

    const stylesheet = `/*
 * Generated by scripts/vendor-fonts.mjs — do not edit by hand.
 *
 * Self-hosted copies of every font the app renders (UI, settings font options and export/print faces).
 * Serving them from the app's own origin keeps page loads and print iframes free of third-party
 * requests, and lets the print code wait on document.fonts before it starts a job (#701).
 */
${faces
    .map(
        ({ family, weight, unicodeRange, file }) => `@font-face {
    font-family: '${family}';
    font-style: normal;
    font-weight: ${weight};
    font-display: swap;
    src: url('./${file}') format('woff2');
    unicode-range: ${unicodeRange};
}`
    )
    .join('\n')}
`;
    await writeFile(path.join(OUT_DIR, 'fonts.css'), stylesheet);
    console.log(
        `\n${faces.length} faces in ${downloaded.size} files, ${(bytes / 1024).toFixed(0)} KB -> public/fonts/fonts.css`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
