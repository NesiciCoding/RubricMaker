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
