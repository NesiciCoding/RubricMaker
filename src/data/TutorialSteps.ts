import type { Step } from 'react-joyride';
import type { TFunction } from 'i18next';

/** Five-step in-page tour for the grade-student workflow. */
export function getGradingTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="grading-criteria"]',
            title: t('tutorial.grading_step_criteria_title'),
            content: t('tutorial.grading_step_criteria_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="grading-level-btn"]',
            title: t('tutorial.grading_step_level_title'),
            content: t('tutorial.grading_step_level_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="grading-comment"]',
            title: t('tutorial.grading_step_comment_title'),
            content: t('tutorial.grading_step_comment_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="grading-modifier"]',
            title: t('tutorial.grading_step_modifier_title'),
            content: t('tutorial.grading_step_modifier_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="grading-footer"]',
            title: t('tutorial.grading_step_footer_title'),
            content: t('tutorial.grading_step_footer_content'),
            placement: 'top',
            skipBeacon: true,
        },
    ];
}

export function getRubricBuilderTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="rb-meta"]',
            title: t('tutorial.rb_step_meta_title'),
            content: t('tutorial.rb_step_meta_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="rb-scoring-mode"]',
            title: t('tutorial.rb_step_scoring_title'),
            content: t('tutorial.rb_step_scoring_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="rb-criteria-section"]',
            title: t('tutorial.rb_step_criteria_title'),
            content: t('tutorial.rb_step_criteria_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="rb-save"]',
            title: t('tutorial.rb_step_save_title'),
            content: t('tutorial.rb_step_save_content'),
            placement: 'bottom',
            skipBeacon: true,
            isFixed: true,
        },
    ];
}

export function getExportTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="export-rubric"]',
            title: t('tutorial.export_step_rubric_title'),
            content: t('tutorial.export_step_rubric_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="export-template"]',
            title: t('tutorial.export_step_template_title'),
            content: t('tutorial.export_step_template_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="export-grades"]',
            title: t('tutorial.export_step_grades_title'),
            content: t('tutorial.export_step_grades_content'),
            placement: 'top',
            skipBeacon: true,
        },
    ];
}

export function getStatisticsTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="stats-controls"]',
            title: t('tutorial.stats_step_controls_title'),
            content: t('tutorial.stats_step_controls_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="stats-criterion-chart"]',
            title: t('tutorial.stats_step_criterion_title'),
            content: t('tutorial.stats_step_criterion_content'),
            placement: 'top',
            skipBeacon: true,
        },
    ];
}

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
