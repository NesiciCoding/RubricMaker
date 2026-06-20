import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class RubricBuilderPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async gotoNew(): Promise<void> {
        await this.navigate('/rubrics/new');
    }

    async gotoEdit(id: string): Promise<void> {
        await this.navigate(`/rubrics/${id}`);
    }

    async fillName(name: string): Promise<void> {
        const input = this.page.getByPlaceholder('Rubric Name...');
        await input.clear();
        await input.fill(name);
    }

    async fillSubject(subject: string): Promise<void> {
        const input = this.page.getByPlaceholder('Subject / Grade...');
        await input.clear();
        await input.fill(subject);
    }

    async addFirstCriterion(): Promise<void> {
        // New rubrics always start with one criterion; only click if truly empty
        const btn = this.page.getByRole('button', { name: /add first criterion/i });
        if (await btn.isVisible()) await btn.click();
    }

    async addCriterionRow(): Promise<void> {
        await this.page.getByRole('button', { name: /add row/i }).click();
    }

    async fillCriterionTitle(index: number, title: string): Promise<void> {
        const inputs = this.page.getByPlaceholder('Criterion Name');
        await inputs.nth(index).clear();
        await inputs.nth(index).fill(title);
    }

    async save(): Promise<void> {
        await this.page.locator('.topbar button.btn-primary').click({ force: true });
    }

    async waitForSaved(): Promise<void> {
        // For NEW rubrics handleSave() calls navigate('/rubrics/:id') before the
        // component re-renders with saved=true, so a fresh RubricBuilder instance
        // mounts with saved=false and the "Saved" text is never visible on the /new
        // page.  Accept either signal: the button text (edit flows) OR the URL
        // leaving /rubrics/new (create flows).
        await Promise.any([
            this.page
                .locator('.topbar button.btn-primary')
                .filter({ hasText: /saved/i })
                .waitFor({ timeout: 8_000 }),
            this.page.waitForURL(/\/#\/rubrics\/(?!new)[^/]*$/, { timeout: 8_000 }),
        ]);
    }

    async openVersionHistory(): Promise<void> {
        // force: true bypasses stability — button is visible but DOM re-renders
        // during save keep it technically "unstable" for Playwright's click check.
        await this.page.getByRole('button', { name: /history/i }).click({ force: true });
    }

    async closeVersionHistory(): Promise<void> {
        // The panel is a focus-trapping dialog: the outside trigger is aria-hidden
        // while it's open, so close it the modal way rather than re-clicking it.
        await this.page.keyboard.press('Escape');
    }

    async saveVersion(label?: string): Promise<void> {
        if (label) {
            await this.page.getByPlaceholder(/label.*optional/i).fill(label);
        }
        await this.page.getByRole('button', { name: /save snapshot/i }).click();
    }

    async restoreVersion(index: number): Promise<void> {
        this.page.once('dialog', (dialog) => dialog.accept());
        const restoreButtons = this.page.getByRole('button', { name: /restore/i });
        await restoreButtons.nth(index).click();
    }

    getNameError() {
        return this.page.locator('#name-error');
    }
}
