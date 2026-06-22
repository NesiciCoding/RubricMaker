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
        return this.page.locator('.card h3').allTextContents();
    }

    dragHandle(name: string): Locator {
        return this.testCard(name).getByLabel(/drag to reorder/i);
    }

    // ── Assignment modal ──────────────────────────────────────────────────────

    async openAssignModal(testName: string): Promise<void> {
        await this.testCard(testName)
            .getByRole('button', { name: /assign to students/i })
            .click();
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
        await this.testCard(testName)
            .getByRole('button', { name: /import submission code/i })
            .click();
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

    classAverageAdjuster(testName: string): Locator {
        return this.testCard(testName)
            .locator('.card')
            .filter({ hasText: /class average adjustment/i });
    }

    async setTargetAverage(testName: string, value: number): Promise<void> {
        const input = this.classAverageAdjuster(testName).locator('#adjuster-target-pct');
        await input.fill(String(value));
    }

    async applyAdjustment(testName: string): Promise<void> {
        await this.classAverageAdjuster(testName)
            .getByRole('button', { name: /apply adjustment/i })
            .click();
    }
}
