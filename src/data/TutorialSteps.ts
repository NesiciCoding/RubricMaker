import type { Step } from 'react-joyride';
import type { TFunction } from 'i18next';

export function getTutorialSteps(t: TFunction): Step[] {
    return [
        {
            target: '.dashboard-container',
            title: t('tutorial.step_welcome_title'),
            content: t('tutorial.step_welcome_content'),
            placement: 'center',
            skipBeacon: true,
        },
        {
            target: '[data-tour="/rubrics"]',
            title: t('tutorial.step_rubrics_title'),
            content: t('tutorial.step_rubrics_content'),
            placement: 'right',
            skipBeacon: true,
        },
        {
            target: '[data-tour="/students"]',
            title: t('tutorial.step_students_title'),
            content: t('tutorial.step_students_content'),
            placement: 'right',
            skipBeacon: true,
        },
        {
            target: '[data-tour="dashboard-grades"]',
            title: t('tutorial.step_grading_title'),
            content: t('tutorial.step_grading_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="/cefr-overview"]',
            title: t('tutorial.step_cefr_title'),
            content: t('tutorial.step_cefr_content'),
            placement: 'right',
            skipBeacon: true,
        },
        {
            target: '[data-tour="/attachments"]',
            title: t('tutorial.step_attachments_title'),
            content: t('tutorial.step_attachments_content'),
            placement: 'right',
            skipBeacon: true,
        },
        {
            target: '[data-tour="/statistics"]',
            title: t('tutorial.step_statistics_title'),
            content: t('tutorial.step_statistics_content'),
            placement: 'right',
            skipBeacon: true,
        },
        {
            target: '[data-tour="/comments"]',
            title: t('tutorial.step_comments_title'),
            content: t('tutorial.step_comments_content'),
            placement: 'right',
            skipBeacon: true,
        },
        {
            target: '[data-tour="/export"]',
            title: t('tutorial.step_export_title'),
            content: t('tutorial.step_export_content'),
            placement: 'right',
            skipBeacon: true,
        },
        {
            target: '[data-tour="/settings"]',
            title: t('tutorial.step_settings_title'),
            content: t('tutorial.step_settings_content'),
            placement: 'right',
            skipBeacon: true,
        },
    ];
}
