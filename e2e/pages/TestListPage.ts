import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class TestListPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/tests');
    }

    testCard(name: string): Locator {
        return this.page.locator('.card').filter({ has: this.page.getByRole('heading', { name }) });
    }

    cardTitles() {
        // Row titles, not heading levels: the level follows the page outline (#533).
        return this.page.locator('.card .item-heading').allTextContents();
    }

    dragHandle(name: string): Locator {
        return this.testCard(name).getByLabel(/drag to reorder/i);
    }

    /** Secondary card actions (assign, import, monitor, …) live in the card's overflow menu. */
    async openCardMenu(testName: string): Promise<void> {
        await this.testCard(testName)
            .getByRole('button', { name: /more actions/i })
            .click();
    }

    cardMenuItem(name: RegExp): Locator {
        return this.page.getByRole('menuitem', { name });
    }

    // ── Assignment modal ──────────────────────────────────────────────────────

    async openAssignModal(testName: string): Promise<void> {
        await this.openCardMenu(testName);
        await this.cardMenuItem(/assign to students/i).click();
    }

    assignmentModal(): Locator {
        return this.page.locator('.modal').filter({ has: this.page.locator('#test-assignment-title') });
    }

    async setAssignmentClass(className: string): Promise<void> {
        await this.assignmentModal().locator('#ta-class').selectOption({ label: className });
    }

    studentLinkInput(studentName: string): Locator {
        return this.assignmentModal().getByLabel(`Test link for ${studentName}`);
    }

    async getStudentAssignmentLink(studentName: string): Promise<string> {
        return this.studentLinkInput(studentName).inputValue();
    }

    async closeAssignmentModal(): Promise<void> {
        await this.assignmentModal().locator('button.btn-secondary', { hasText: 'Close' }).click();
    }

    // ── Import submission modal ──────────────────────────────────────────────

    async openImportModal(testName: string): Promise<void> {
        await this.openCardMenu(testName);
        await this.cardMenuItem(/import submission code/i).click();
    }

    importModal(): Locator {
        return this.page.locator('.modal').filter({ has: this.page.locator('#test-import-title') });
    }

    async pasteSubmissionCode(code: string): Promise<void> {
        await this.importModal().locator('#test-submission-code').fill(code);
    }

    async clickImport(): Promise<void> {
        await this.importModal()
            .getByRole('button', { name: /^import submission$/i })
            .click();
    }

    importSuccessMessage(): Locator {
        return this.importModal().getByText(/submission imported successfully/i);
    }

    async closeImportModal(): Promise<void> {
        await this.importModal().locator('button.btn-primary', { hasText: 'Close' }).click();
    }

    // ── Results navigation ────────────────────────────────────────────────────

    async openResultsList(testName: string): Promise<void> {
        await this.testCard(testName)
            .getByRole('button', { name: /^results$/i })
            .click();
    }

    async openStudentResults(studentName: string): Promise<void> {
        await this.page.getByRole('button', { name: studentName }).click();
    }

    // ── Class average adjuster ────────────────────────────────────────────────

    classAverageAdjuster(): Locator {
        // Results and analysis open in the results drawer, not inside the card.
        return this.page
            .getByRole('dialog')
            .locator('.card')
            .filter({ hasText: /class average adjustment/i });
    }

    async setTargetAverage(value: number): Promise<void> {
        const input = this.classAverageAdjuster().locator('#adjuster-target-pct');
        await input.fill(String(value));
    }

    async applyAdjustment(): Promise<void> {
        await this.classAverageAdjuster()
            .getByRole('button', { name: /apply adjustment/i })
            .click();
    }
}
