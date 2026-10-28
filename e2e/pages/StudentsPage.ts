import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class StudentsPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/students');
    }

    async openAddStudentModal(): Promise<void> {
        await this.page
            .getByRole('button', { name: /add student/i })
            .first()
            .click();
        await this.page.locator('#student-name').waitFor({ timeout: 10_000 });
    }

    async fillStudentName(name: string): Promise<void> {
        await this.page.locator('#student-name').fill(name);
    }

    async fillStudentEmail(email: string): Promise<void> {
        await this.page.locator('#student-email').fill(email);
    }

    async selectClass(className: string): Promise<void> {
        await this.page.locator('#student-class').selectOption({ label: className });
    }

    async submitStudentForm(): Promise<void> {
        const modal = this.page.getByRole('dialog').or(this.page.locator('[aria-labelledby="student-modal-title"]'));
        await modal.getByRole('button', { name: /add|save/i }).click();
    }

    async closeModal(): Promise<void> {
        await this.page.getByRole('button', { name: /close/i }).click();
    }

    getStudentRow(name: string) {
        return this.page.getByText(name, { exact: true }).first();
    }

    isStudentVisible(name: string) {
        return this.page.getByText(name, { exact: true }).isVisible();
    }

    // ── Class management ──────────────────────────────────────────────────────

    /** Remounts the app so it re-reads localStorage — for persistence assertions. */
    async reloadApp(): Promise<void> {
        await this.page.reload();
        await this.page.waitForSelector('.main-area', { timeout: 20_000 });
    }

    getCohortBar() {
        return this.page.getByRole('group', { name: /filter roster by cohort/i });
    }

    /** A class chip in the cohort bar; matches on a substring because the chip also carries badges and a count. */
    getClassChip(className: string) {
        const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this.getCohortBar().getByRole('button', { name: new RegExp(escaped, 'i') });
    }

    /** The options button sits next to the chip inside the same draggable wrapper. */
    getClassOptionsButton(className: string) {
        return this.getClassChip(className)
            .locator('..')
            .getByRole('button', { name: /class options/i });
    }

    async openClassMenu(className: string): Promise<void> {
        await this.getClassOptionsButton(className).click();
        await this.getClassMenu().waitFor({ state: 'visible' });
    }

    getClassMenu() {
        return this.page.getByRole('menu');
    }

    async openClassSettings(className: string): Promise<void> {
        await this.openClassMenu(className);
        await this.getClassMenu()
            .getByRole('menuitem', { name: /rename/i })
            .click();
        await this.getClassSettings().waitFor({ state: 'visible' });
    }

    getClassSettings() {
        return this.page.locator('.modal');
    }

    getClassYearChips() {
        return this.getClassSettings().getByRole('group', { name: /^school year$/i });
    }

    getClassTrackChips() {
        return this.getClassSettings().getByRole('group', { name: /^vo track$/i });
    }

    async toggleClassYear(label: string): Promise<void> {
        await this.getClassYearChips().getByRole('button', { name: label }).click();
    }

    async toggleClassTrack(label: string): Promise<void> {
        await this.getClassTrackChips().getByRole('button', { name: label }).click();
    }

    async saveClassSettings(): Promise<void> {
        await this.getClassSettings()
            .getByRole('button', { name: /^save$/i })
            .click();
        await this.getClassSettings().waitFor({ state: 'hidden' });
    }

    // ── Student modal cohort fields ───────────────────────────────────────────

    async openEditStudentModal(name: string): Promise<void> {
        await this.getStudentRowByName(name)
            .getByRole('button', { name: /edit student/i })
            .click();
        await this.page.locator('#student-name').waitFor({ timeout: 10_000 });
    }

    getStudentRowByName(name: string) {
        return this.page.locator('table tbody tr').filter({ hasText: name });
    }

    studentYearSelect() {
        return this.page.locator('#student-year');
    }

    studentTrackSelect() {
        return this.page.locator('#student-track');
    }

    async uploadCsv(filePath: string): Promise<void> {
        const [fileChooser] = await Promise.all([
            this.page.waitForEvent('filechooser'),
            this.page.getByRole('button', { name: /upload|import csv/i }).click(),
        ]);
        await fileChooser.setFiles(filePath);
    }
}
