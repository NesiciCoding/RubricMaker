/**
 * Keyboard, dialog, language and live-region checks axe cannot see.
 *   node docs/a11y/interactions.mjs --base http://localhost:5199
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeed, routes, AXE_TAGS } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const argv = process.argv.slice(2);
const base = (argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'http://localhost:5199').replace(/\/$/, '');
const seed = buildSeed();

const report = [];
const add = (name, data) => {
    report.push({ name, ...data });
    console.log(`\n### ${name}\n${JSON.stringify(data, null, 2).slice(0, 1200)}`);
};
const newContext = async (browser, viewport = { width: 1280, height: 900 }, extra = {}) => {
    const ctx = await browser.newContext({ viewport, ...extra });
    await ctx.addInitScript((data) => {
        for (const [k, v] of Object.entries(data)) localStorage.setItem(k, JSON.stringify(v));
    }, seed);
    return ctx;
};
const open = async (page, url) => {
    await page.goto(`${base}/#${url}`);
    await page.waitForSelector('.main-area');
    await page.waitForTimeout(800);
};
const active = (page) =>
    page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { tag: 'BODY' };
        const cs = getComputedStyle(el);
        return {
            tag: el.tagName.toLowerCase(),
            name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
            outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
            hasFocusStyle: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
            inDialog: Boolean(el.closest('[role="dialog"]')),
        };
    });
const axe = async (page) => {
    if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ content: axeSource });
    return page.evaluate(
        (tags) =>
            window.axe
                .run(document, { runOnly: { type: 'tag', values: tags } })
                .then((r) => r.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }))),
        AXE_TAGS
    );
};

async function main() {
    const browser = await chromium.launch();

    // Landing (signed out)
    {
        const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
        await page.goto(`${base}/#/`);
        await page.waitForTimeout(1200);
        await page.keyboard.press('Tab');
        add('landing', {
            info: await page.evaluate(() => ({
                h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
                skipLinks: document.querySelectorAll('.skip-nav').length,
                docTitle: document.title,
                lang: document.documentElement.lang,
            })),
            firstTab: await active(page),
            axe: await axe(page),
        });
        await page.context().close();
    }

    // Skip link + keyboard walk
    {
        const ctx = await newContext(browser);
        const page = await ctx.newPage();
        await open(page, '/');
        await page.waitForTimeout(400);
        await page.keyboard.press('Tab');
        const firstTab = await active(page);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        const afterSkip = await page.evaluate(() => ({
            active: document.activeElement?.tagName,
            hash: location.hash,
            mainText: (document.querySelector('.main-area')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
            mainH1: [...document.querySelectorAll('.main-area h1')].map((h) => h.textContent.trim()),
            mainTabIndex: document.querySelector('main')?.getAttribute('tabindex'),
        }));
        const walk = [];
        for (let i = 0; i < 24; i++) {
            await page.keyboard.press('Tab');
            walk.push(await active(page));
        }
        add('skip-link-and-tab-walk', {
            firstTab,
            afterSkip,
            stops: walk.map((w) => `${w.tag}${w.name ? ': ' + w.name.slice(0, 42) : ''}`),
            stopsWithoutVisibleFocus: walk.filter((w) => w.tag !== 'BODY' && !w.hasFocusStyle),
        });
        await ctx.close();
    }

    // Add Student dialog
    {
        const ctx = await newContext(browser);
        const page = await ctx.newPage();
        await open(page, '/students');
        await page.getByRole('button', { name: /^Add Student$/ }).first().click();
        await page.locator('[role="dialog"]').waitFor();
        const info = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"]');
            return {
                ariaModal: d?.getAttribute('aria-modal'),
                labelText: (document.getElementById(d?.getAttribute('aria-labelledby') || '')?.textContent || '').trim(),
                backgroundInert: Boolean(document.querySelector('#root')?.inert),
                autoFocus: document.activeElement?.id,
            };
        });
        const trail = [];
        for (let i = 0; i < 12; i++) {
            await page.keyboard.press('Tab');
            trail.push(await active(page));
        }
        const modalAxe = await axe(page);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const openAfterEscape = (await page.locator('[role="dialog"]').count()) > 0;
        if (openAfterEscape) await page.getByRole('button', { name: 'Close' }).first().click();
        await page.waitForTimeout(300);
        add('add-student-dialog', {
            info,
            tabStopsOutsideDialog: trail.filter((t) => !t.inDialog).length,
            focusTrail: trail.map((t) => `${t.tag}:${(t.name || '').slice(0, 30)}${t.inDialog ? '' : ' [OUTSIDE]'}`),
            openAfterEscape,
            focusAfterClose: await active(page),
            axe: modalAxe,
        });
        await ctx.close();
    }

    // Confirm dialog focus restore + toast live region
    {
        const ctx = await newContext(browser);
        const page = await ctx.newPage();
        await open(page, '/rubrics');
        const del = page.getByRole('button', { name: /^Delete$/ }).first();
        await del.click();
        await page.locator('[role="dialog"]').waitFor();
        const before = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"]');
            return {
                ariaModal: d?.getAttribute('aria-modal'),
                title: d?.querySelector('h2,h3')?.textContent?.trim(),
                describedBy: d?.getAttribute('aria-describedby'),
                firstFocus: document.activeElement?.textContent?.trim().slice(0, 30),
            };
        });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        add('confirm-dialog', { before, closedOnEscape: (await page.locator('[role="dialog"]').count()) === 0, focusAfterClose: await active(page) });

        await del.click();
        await page.locator('[role="dialog"]').waitFor();
        await page.getByRole('button', { name: /^Delete$/ }).last().click();
        await page.waitForTimeout(600);
        add('toast', {
            toast: await page.evaluate(() => {
                const el = document.querySelector('[role="alert"]');
                return el ? { text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 100), ariaLive: el.getAttribute('aria-live') } : null;
            }),
        });
        await ctx.close();
    }

    // Settings tab pattern
    {
        const ctx = await newContext(browser);
        const page = await ctx.newPage();
        await open(page, '/settings');
        const tabs = await page.evaluate(() => ({
            tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => ({
                name: t.textContent.trim(),
                selected: t.getAttribute('aria-selected'),
                tabindex: t.getAttribute('tabindex'),
                controls: t.getAttribute('aria-controls'),
            })),
            tabpanels: document.querySelectorAll('[role="tabpanel"]').length,
        }));
        await page.evaluate(() => document.querySelector('[role="tab"]').focus());
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(200);
        add('settings-tabs', {
            ...tabs,
            afterArrowRight: await page.evaluate(() => ({
                focused: document.activeElement?.textContent?.trim(),
                selected: [...document.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('aria-selected')),
            })),
        });
        await ctx.close();
    }

    // Mobile navigation drawer
    {
        const ctx = await newContext(browser, { width: 390, height: 844 }, { hasTouch: true });
        const page = await ctx.newPage();
        await open(page, '/');
        await page.locator('button[aria-label="Open navigation menu"]').first().click();
        await page.waitForTimeout(400);
        const drawer = await page.evaluate(() => {
            const s = document.querySelector('.sidebar');
            return {
                open: s?.classList.contains('mobile-open'),
                role: s?.getAttribute('role'),
                ariaModal: s?.getAttribute('aria-modal'),
                focusInside: Boolean(document.activeElement?.closest('.sidebar')),
                focus: document.activeElement?.tagName + ':' + (document.activeElement?.getAttribute('aria-label') || ''),
                backgroundInert: Boolean(document.querySelector('.main-area')?.inert),
            };
        });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        add('mobile-drawer', {
            drawer,
            stillOpenAfterEscape: await page.evaluate(() => document.querySelector('.sidebar')?.classList.contains('mobile-open')),
            axe: await axe(page),
        });
        await ctx.close();
    }

    // html lang after switching UI language
    for (const lang of ['nl', 'fr']) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        await ctx.addInitScript(
            ([data, l]) => {
                for (const [k, v] of Object.entries(data)) localStorage.setItem(k, JSON.stringify(v));
                const s = JSON.parse(localStorage.getItem('rm_settings'));
                s.language = l;
                localStorage.setItem('rm_settings', JSON.stringify(s));
            },
            [seed, lang]
        );
        const page = await ctx.newPage();
        await open(page, '/settings');
        add(`language-${lang}`, await page.evaluate(() => ({ htmlLang: document.documentElement.lang, heading: document.querySelector('h2,h3')?.textContent.trim() })));
        await ctx.close();
    }

    // Route change: focus, title, announcement
    {
        const ctx = await newContext(browser);
        const page = await ctx.newPage();
        await open(page, '/');
        await page.getByRole('link', { name: 'Students' }).first().focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(900);
        add('route-change', await page.evaluate(() => ({
            hash: location.hash,
            title: document.title,
            focus: (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim().slice(0, 40),
            statusAnnouncement: document.querySelector('[role="status"][aria-live]')?.textContent,
            h1: [...document.querySelectorAll('h1')].length,
            headings: [...document.querySelectorAll('h2,h3')].slice(0, 2).map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 30)),
        })));
        await ctx.close();
    }

    // Reduced motion on the modal
    {
        const ctx = await newContext(browser, { width: 1280, height: 900 }, { reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await open(page, '/rubrics');
        await page.getByRole('button', { name: /^Delete$/ }).first().click();
        await page.waitForTimeout(300);
        add('reduced-motion', await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"]');
            const overlay = document.querySelector('.modal-overlay');
            return {
                prefersReduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
                modalAnimation: modal ? getComputedStyle(modal).animationName + ' ' + getComputedStyle(modal).animationDuration : null,
                overlayAnimation: overlay ? getComputedStyle(overlay).animationName + ' ' + getComputedStyle(overlay).animationDuration : null,
            };
        }));
        await ctx.close();
    }

    await browser.close();
    writeFileSync(resolve(here, 'results/interactions.json'), JSON.stringify(report, null, 2));
    console.log('\nWrote results/interactions.json');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
