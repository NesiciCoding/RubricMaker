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
        await this.page.getByRole('button', { name: /add student/i }).click();
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
        const modal = this.page.getByRole('dialog').or(
            this.page.locator('[aria-labelledby="student-modal-title"]')
        );
        await modal.getByRole('button', { name: /add|save/i }).click();
    }

    async closeModal(): Promise<void> {
        await this.page.getByRole('button', { name: /close/i }).click();
    }

    getStudentRow(name: string) {
        return this.page.getByText(name, { exact: false }).first();
    }

    isStudentVisible(name: string) {
        return this.page.getByText(name).isVisible();
    }

    async uploadCsv(filePath: string): Promise<void> {
        const [fileChooser] = await Promise.all([
            this.page.waitForEvent('filechooser'),
            this.page.getByRole('button', { name: /upload|import csv/i }).click(),
        ]);
        await fileChooser.setFiles(filePath);
    }
}
