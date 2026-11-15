import type { Page, Download } from '@playwright/test';
import { BasePage } from './BasePage';

export class ExportPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/export');
    }

    async selectExportType(type: 'rubric' | 'reports' | 'exam' | 'essays'): Promise<void> {
        const names: Record<typeof type, RegExp> = {
            rubric: /Rubric grades/,
            reports: /Progress reports/,
            exam: /Exam booklet/,
            essays: /Essays/,
        };
        await this.page
            .getByRole('group', { name: 'What do you want to export?' })
            .getByRole('button', { name: names[type] })
            .click();
    }

    async selectReportOutput(mode: 'period' | 'card'): Promise<void> {
        await this.page
            .getByRole('group', { name: 'Report output' })
            .getByRole('button', { name: mode === 'period' ? 'Period report' : 'Report card', exact: true })
            .click();
    }

    async setStudentSelected(studentName: string, selected: boolean): Promise<void> {
        const checkbox = this.page.getByRole('checkbox', { name: studentName, exact: true });
        if (selected) await checkbox.check();
        else await checkbox.uncheck();
    }

    async selectRubric(rubricName: string): Promise<void> {
        const select = this.page.locator('[data-tour="export-rubric"] select').first();
        await select.selectOption({ label: rubricName });
    }

    async selectRubricById(rubricId: string): Promise<void> {
        const select = this.page.locator('[data-tour="export-rubric"] select').first();
        await select.selectOption({ value: rubricId });
    }

    async toggleStudent(studentName: string): Promise<void> {
        const escaped = studentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const row = this.page.getByRole('row', { name: new RegExp(`\\b${escaped}\\b`) });
        await row.getByRole('checkbox').first().click();
    }

    async selectAllStudents(): Promise<void> {
        await this.page.getByRole('button', { name: 'Select All', exact: true }).click();
    }

    async deselectAllStudents(): Promise<void> {
        await this.page.getByRole('button', { name: 'Deselect All', exact: true }).click();
    }

    async exportPdf(): Promise<Download> {
        const [download] = await Promise.all([
            this.page.waitForEvent('download'),
            this.page.getByRole('button', { name: /print.*pdf/i }).click(),
        ]);
        return download;
    }

    async exportDocx(): Promise<Download> {
        const [download] = await Promise.all([
            this.page.waitForEvent('download'),
            this.page.getByRole('button', { name: /export word/i }).click(),
        ]);
        return download;
    }

    /** Exports the selected students' graded results (not the blank rubric) as a Word document. */
    async exportStudentGradesDocx(): Promise<Download> {
        const [download] = await Promise.all([
            this.page.waitForEvent('download'),
            this.page.getByRole('button', { name: /export \d+ as docx/i }).click(),
        ]);
        return download;
    }
}
