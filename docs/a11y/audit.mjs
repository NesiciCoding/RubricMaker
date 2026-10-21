/**
 * Route-level accessibility scanner (axe-core 4.12, WCAG 2.0/2.1/2.2 A+AA + best practice).
 *
 *   node docs/a11y/audit.mjs --base http://localhost:5199 --accent none
 *   node docs/a11y/audit.mjs --base http://localhost:5199 --accent none --mobile
 *   node docs/a11y/audit.mjs --route /settings --light
 *
 * Writes results/axe-<viewport>[-default].json. `--accent none` uses the theme's own accent;
 * passing a hex (default #3b82f6) exercises a custom accent colour.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeed, routes, AXE_TAGS } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const base = arg('--base', 'http://localhost:5199').replace(/\/$/, '');
const mobile = argv.includes('--mobile');
const themeArg = argv.includes('--light') ? ['light'] : argv.includes('--dark') ? ['dark'] : ['light', 'dark'];
const onlyRoute = arg('--route', null);
const accent = arg('--accent', '#3b82f6');
const seed = buildSeed({ accentColor: accent === 'none' ? undefined : accent });

async function scan(page, url, label, theme) {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${base}/#${url}`, { waitUntil: 'domcontentloaded' });
    await page
        .waitForFunction(() => {
            const main = document.querySelector('.main-area');
            return main && !main.querySelector('[aria-busy="true"]');
        }, { timeout: 15000 })
        .catch(() => {});
    await page.waitForTimeout(900);

    const pageTitle = await page.title();
    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), AXE_TAGS);
    const structure = await page.evaluate(() => {
        const all = [...document.querySelectorAll('*')];
        const label = (el) =>
            el.getAttribute('aria-label') ||
            (el.getAttribute('aria-labelledby') &&
                (document.getElementById(el.getAttribute('aria-labelledby'))?.textContent || '').trim()) ||
            '';
        return {
            headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
                level: Number(h.tagName[1]),
                text: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90),
            })),
            landmarks: [
                ...document.querySelectorAll('main,nav,header,footer,aside,[role=main],[role=navigation],[role=banner],[role=contentinfo],[role=complementary]'),
            ].map((el) => ({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', label: label(el) })),
            positiveTabindex: all
                .filter((el) => Number(el.getAttribute('tabindex')) > 0)
                .map((el) => ({ tag: el.tagName.toLowerCase(), tabindex: el.getAttribute('tabindex') })),
            images: [...document.images].map((img) => ({ alt: img.getAttribute('alt'), src: (img.getAttribute('src') || '').slice(0, 80) })),
            iframes: [...document.querySelectorAll('iframe')].map((f) => ({ title: f.getAttribute('title') })),
            smallTargets: [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab]')]
                .filter((el) => {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) return false;
                    if (el.closest('.sr-only') || (el.tagName === 'A' && cs.display === 'inline')) return false;
                    return r.width < 24 || r.height < 24;
                })
                .slice(0, 40)
                .map((el) => {
                    const r = el.getBoundingClientRect();
                    return {
                        tag: el.tagName.toLowerCase(),
                        name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 50),
                        w: Math.round(r.width),
                        h: Math.round(r.height),
                    };
                }),
            htmlLang: document.documentElement.lang,
            htmlDir: document.documentElement.dir,
            docTitleSpans: [...document.querySelectorAll('.topbar-title')].map((e) => e.tagName),
        };
    });

    return {
        route: url,
        label,
        theme,
        viewport: mobile ? 'mobile' : 'desktop',
        pageTitle,
        pageErrors,
        violations: results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            wcag: v.tags.filter((t) => t.startsWith('wcag')),
            nodes: v.nodes.map((n) => ({ target: n.target, html: n.html.slice(0, 300), summary: n.failureSummary })),
        })),
        structure,
    };
}

async function main() {
    const browser = await chromium.launch();
    const out = [];
    for (const theme of themeArg) {
        const context = await browser.newContext({
            viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
            colorScheme: theme,
        });
        await context.addInitScript(
            ([data, t]) => {
                for (const [k, v] of Object.entries(data)) {
                    if (v !== undefined) localStorage.setItem(k, JSON.stringify(v));
                }
                const s = JSON.parse(localStorage.getItem('rm_settings'));
                s.theme = t;
                localStorage.setItem('rm_settings', JSON.stringify(s));
            },
            [seed, theme]
        );
        for (const [url, label] of routes) {
            if (onlyRoute && url !== onlyRoute) continue;
            const page = await context.newPage();
            try {
                out.push(await scan(page, url, label, theme));
                console.log(`${theme} ${url} ok`);
            } catch (err) {
                out.push({ route: url, label, theme, error: String(err) });
                console.log(`${theme} ${url} FAILED ${err.message}`);
            } finally {
                await page.close();
            }
        }
        await context.close();
    }
    await browser.close();
    mkdirSync(resolve(here, 'results'), { recursive: true });
    const file = resolve(here, `results/axe-${mobile ? 'mobile' : 'desktop'}${accent === 'none' ? '-default' : ''}.json`);
    writeFileSync(file, JSON.stringify(out, null, 2));
    const totals = {};
    for (const r of out) for (const v of r.violations || []) totals[v.id] = (totals[v.id] || 0) + v.nodes.length;
    console.log('Violation totals:', totals);
    console.log('Wrote', file);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
