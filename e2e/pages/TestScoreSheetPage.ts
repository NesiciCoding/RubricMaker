import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class TestScoreSheetPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(testId: string, tab?: 'analysis'): Promise<void> {
        await this.navigate(`/tests/${testId}/scores${tab ? `?tab=${tab}` : ''}`);
    }

    cell(student: string, question: string | number): Locator {
        return this.page.getByLabel(new RegExp(`^${student}, question ${question}, max `));
    }

    row(student: string): Locator {
        return this.page.getByRole('row').filter({ has: this.page.getByRole('rowheader', { name: student }) });
    }

    async selectNorm(type: 'scale' | 'nterm' | 'caesura' | 'table'): Promise<void> {
        await this.page.locator('#norm-type').selectOption(type);
    }

    async openAnalysis(): Promise<void> {
        await this.page.getByRole('button', { name: 'Analysis' }).click();
    }

    /**
     * Viewport coordinates of the clickable score cell closest to the bottom-right corner of the
     * screen. The grid is capped at 70vh, so that cell sits low enough that a context menu has no room
     * to open below it and has to be clamped back on screen.
     */
    async bottomRightCellPoint(): Promise<{ x: number; y: number }> {
        await this.page.locator('input[aria-label*=", question "]').first().waitFor({ state: 'visible' });
        return this.page.evaluate(async () => {
            // The table is still growing as the browser lays out its rows; measuring now would aim at
            // positions that move a frame later.
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            let best: { x: number; y: number; distance: number } | null = null;
            for (const cell of Array.from(document.querySelectorAll<HTMLInputElement>('[aria-label*=", question "]'))) {
                const rect = cell.getBoundingClientRect();
                if (rect.width === 0) continue;
                const x = rect.x + rect.width / 2;
                const y = rect.y + rect.height / 2;
                if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
                // The scrollport clips rows at its edges; only points a real click would hit count.
                if (document.elementFromPoint(x, y) !== cell) continue;
                const distance = window.innerWidth - x + (window.innerHeight - y);
                if (!best || distance < best.distance) best = { x, y, distance };
            }
            if (!best) throw new Error('no score cell is clickable near the bottom-right corner');
            return { x: best.x, y: best.y };
        });
    }

    async pasteInto(cell: Locator, text: string): Promise<void> {
        await cell.evaluate((el, value) => {
            const data = new DataTransfer();
            data.setData('text', value);
            // Firefox ignores the clipboardData init option on synthetic events, so attach it explicitly.
            const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'clipboardData', { value: data });
            el.dispatchEvent(event);
        }, text);
    }
}
