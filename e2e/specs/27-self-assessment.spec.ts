import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';
import { SelfAssessmentPage } from '../pages/SelfAssessmentPage';
import type { LinkedCefrDescriptor } from '../../src/types';

const descriptor: LinkedCefrDescriptor = {
    descriptorId: 'w-b1-1',
    level: 'B1',
    skill: 'writing',
    descriptionEn: 'Can write straightforward, detailed texts on a range of familiar subjects.',
    descriptionNl: 'Kan eenvoudige, gedetailleerde teksten schrijven over een reeks vertrouwde onderwerpen.',
};

test.describe('Self-assessment', () => {
    test('student rates a descriptor, adds a reflection, and the submission persists', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ id: 'sa-class', name: 'SA Class' });
        const rubric = buildRubric({
            id: 'sa-rubric',
            name: 'SA Rubric',
            criteria: [
                {
                    id: 'sa-criterion',
                    title: 'Writing Quality',
                    description: '',
                    weight: 100,
                    levels: [
                        { id: 'sa-level', label: 'Good', minPoints: 3, maxPoints: 3, description: '', subItems: [] },
                    ],
                    cefrDescriptors: [descriptor],
                },
            ],
        });
        const student = buildStudent(cls.id, { id: 'sa-student', name: 'SA Student' });

        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });

        const page = new SelfAssessmentPage(appPage);
        await page.goto(rubric.id, student.id);

        await expect(appPage.getByText(descriptor.descriptionEn)).toBeVisible();
        await expect(appPage.getByText('0/1')).toBeVisible();

        await page.setConfidence(0, 'Usually');
        await page.fillReflection('I feel good about this skill.');
        await page.save();
        await page.waitForSaved();

        await appPage.reload();
        await expect(appPage.locator('textarea')).toHaveValue('I feel good about this skill.');
        await expect(appPage.getByText('1/1')).toBeVisible();
    });

    test('deselecting a rated level drops the rated count back down', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'sa-class-2', name: 'SA Class 2' });
        const rubric = buildRubric({
            id: 'sa-rubric-2',
            name: 'SA Rubric 2',
            criteria: [
                {
                    id: 'sa-criterion-2',
                    title: 'Writing Quality',
                    description: '',
                    weight: 100,
                    levels: [
                        { id: 'sa-level-2', label: 'Good', minPoints: 3, maxPoints: 3, description: '', subItems: [] },
                    ],
                    cefrDescriptors: [descriptor],
                },
            ],
        });
        const student = buildStudent(cls.id, { id: 'sa-student-2', name: 'SA Student 2' });

        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });

        const page = new SelfAssessmentPage(appPage);
        await page.goto(rubric.id, student.id);

        await page.setConfidence(0, 'Confident');
        await expect(appPage.getByText('1/1')).toBeVisible();

        await page.setConfidence(0, 'Confident');
        await expect(appPage.getByText('0/1')).toBeVisible();
    });
});
