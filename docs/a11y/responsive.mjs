/**
 * Reflow (1.4.10), resize-text (1.4.4) and text-spacing (1.4.12) checks.
 *   node docs/a11y/responsive.mjs --base http://localhost:5199
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeed, routes } from './fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const base = (argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'http://localhost:5199').replace(/\/$/, '');
const seed = buildSeed();

const measure = () => {
    const vw = window.innerWidth;
    const all = [...document.querySelectorAll('body *')];
    const wide = all
        .filter((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (cs.position === 'fixed' || cs.display === 'none' || r.width === 0) return false;
            if (el.closest('.sr-only')) return false;
            return r.right > vw + 1 || r.left < -1;
        })
        .slice(0, 12)
        .map((el) => {
            const r = el.getBoundingClientRect();
            return { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 40), text: (el.textContent || '').trim().slice(0, 40), left: Math.round(r.left), right: Math.round(r.right) };
        });
    const clipped = all
        .filter((el) => {
            const cs = getComputedStyle(el);
            if (!/(hidden|clip)/.test(cs.overflow + cs.overflowY + cs.overflowX)) return false;
            return el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0;
        })
        .slice(0, 12)
        .map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 40), text: (el.textContent || '').trim().slice(0, 40), scrollH: el.scrollHeight, clientH: el.clientHeight }));
    return {
        viewport: vw,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        wide,
        clipped,
    };
};

async function main() {
    const browser = await chromium.launch();
    const out = { reflow320: [], textZoom200: [], textSpacing: [] };
    const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
    await context.addInitScript((data) => {
        for (const [k, v] of Object.entries(data)) localStorage.setItem(k, JSON.stringify(v));
    }, seed);

    for (const [url, label] of routes) {
        const page = await context.newPage();
        await page.goto(`${base}/#${url}`);
        await page.waitForTimeout(1000);
        out.reflow320.push({ route: url, label, ...(await page.evaluate(measure)) });
        await page.close();
    }

    const wide = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await wide.addInitScript((data) => {
        for (const [k, v] of Object.entries(data)) localStorage.setItem(k, JSON.stringify(v));
    }, seed);
    const subset = ['/', '/rubrics', '/rubrics/rubric-a11y-1/grade/student-a11y-1', '/students', '/statistics', '/settings', '/tests/test-a11y-1', '/docs'];
    for (const url of subset) {
        const page = await wide.newPage();
        await page.goto(`${base}/#${url}`);
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '32px';
        });
        await page.waitForTimeout(400);
        out.textZoom200.push({ route: url, ...(await page.evaluate(measure)) });
        await page.close();
    }
    for (const url of subset) {
        const page = await wide.newPage();
        await page.goto(`${base}/#${url}`);
        await page.waitForTimeout(1000);
        await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }' });
        await page.waitForTimeout(400);
        out.textSpacing.push({ route: url, ...(await page.evaluate(measure)) });
        await page.close();
    }
    await browser.close();
    writeFileSync(resolve(here, 'results/responsive.json'), JSON.stringify(out, null, 2));
    console.log('reflow320 overflows:', out.reflow320.filter((r) => r.horizontalOverflow).map((r) => r.route));
    console.log('Wrote results/responsive.json');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
