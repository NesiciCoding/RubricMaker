import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class ActivityDashboardPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/activity-dashboard');
    }

    rubricRow(rubricName: string): Locator {
        return this.page
            .locator('tr')
            .filter({ has: this.page.getByRole('button', { name: rubricName, exact: true }) });
    }

    async clickAssign(rubricName: string, classIndex = 0): Promise<void> {
        await this.rubricRow(rubricName)
            .getByRole('button', { name: /assign/i })
            .nth(classIndex)
            .click();
    }

    assignModal(): Locator {
        return this.page.locator('.modal').filter({ hasText: /assign grading task/i });
    }

    async fillAssignTeacher(value: string): Promise<void> {
        await this.assignModal()
            .getByPlaceholder(/j\.smith@school\.org/i)
            .fill(value);
    }

    async confirmAssign(): Promise<void> {
        await this.assignModal().locator('.modal-footer button.btn-primary').click();
    }

    pendingTasksPanel(): Locator {
        return this.page.locator('.card').filter({ hasText: /pending grading task/i });
    }

    async deletePendingTask(): Promise<void> {
        await this.pendingTasksPanel()
            .getByRole('button', { name: /delete/i })
            .first()
            .click();
    }

    dragHandle(rubricName: string): Locator {
        return this.rubricRow(rubricName).getByLabel(/drag to reorder/i);
    }
}
