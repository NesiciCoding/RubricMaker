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

export function getComparativeTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="cg-header"]',
            title: t('tutorial.cg_step_header_title'),
            content: t('tutorial.cg_step_header_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="cg-center"]',
            title: t('tutorial.cg_step_center_title'),
            content: t('tutorial.cg_step_center_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="cg-compare"]',
            title: t('tutorial.cg_step_compare_title'),
            content: t('tutorial.cg_step_compare_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="cg-save"]',
            title: t('tutorial.cg_step_save_title'),
            content: t('tutorial.cg_step_save_content'),
            placement: 'top',
            skipBeacon: true,
        },
    ];
}

export function getEssayBuilderTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="eb-prompt"]',
            title: t('tutorial.eb_step_prompt_title'),
            content: t('tutorial.eb_step_prompt_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="eb-rubric"]',
            title: t('tutorial.eb_step_rubric_title'),
            content: t('tutorial.eb_step_rubric_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="eb-assign"]',
            title: t('tutorial.eb_step_assign_title'),
            content: t('tutorial.eb_step_assign_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="eb-monitor"]',
            title: t('tutorial.eb_step_monitor_title'),
            content: t('tutorial.eb_step_monitor_content'),
            placement: 'top',
            skipBeacon: true,
        },
    ];
}

export function getTestBuilderTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="tb-details"]',
            title: t('tutorial.tb_step_details_title'),
            content: t('tutorial.tb_step_details_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="tb-settings"]',
            title: t('tutorial.tb_step_settings_title'),
            content: t('tutorial.tb_step_settings_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="tb-sections"]',
            title: t('tutorial.tb_step_sections_title'),
            content: t('tutorial.tb_step_sections_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="tb-add-question"]',
            title: t('tutorial.tb_step_questions_title'),
            content: t('tutorial.tb_step_questions_content'),
            placement: 'top',
            skipBeacon: true,
        },
    ];
}

export function getActivityDashboardTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="ad-grid"]',
            title: t('tutorial.ad_step_grid_title'),
            content: t('tutorial.ad_step_grid_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="ad-activity"]',
            title: t('tutorial.ad_step_activity_title'),
            content: t('tutorial.ad_step_activity_content'),
            placement: 'right',
            skipBeacon: true,
        },
        {
            target: '[data-tour="ad-cell"]',
            title: t('tutorial.ad_step_cell_title'),
            content: t('tutorial.ad_step_cell_content'),
            placement: 'left',
            skipBeacon: true,
        },
    ];
}

export function getCefrOverviewTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="cefr-controls"]',
            title: t('tutorial.cefr_step_controls_title'),
            content: t('tutorial.cefr_step_controls_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="cefr-view"]',
            title: t('tutorial.cefr_step_view_title'),
            content: t('tutorial.cefr_step_view_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="cefr-heatmap"]',
            title: t('tutorial.cefr_step_heatmap_title'),
            content: t('tutorial.cefr_step_heatmap_content'),
            placement: 'top',
            skipBeacon: true,
        },
    ];
}

export function getSpeakingTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="sp-timer"]',
            title: t('tutorial.sp_step_timer_title'),
            content: t('tutorial.sp_step_timer_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="sp-pronunciation"]',
            title: t('tutorial.sp_step_pronunciation_title'),
            content: t('tutorial.sp_step_pronunciation_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="sp-recordings"]',
            title: t('tutorial.sp_step_recordings_title'),
            content: t('tutorial.sp_step_recordings_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="sp-scoring"]',
            title: t('tutorial.sp_step_scoring_title'),
            content: t('tutorial.sp_step_scoring_content'),
            placement: 'top',
            skipBeacon: true,
        },
    ];
}

export function getStudentProfileTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="sprofile-header"]',
            title: t('tutorial.sprofile_step_header_title'),
            content: t('tutorial.sprofile_step_header_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="sprofile-tabs"]',
            title: t('tutorial.sprofile_step_tabs_title'),
            content: t('tutorial.sprofile_step_tabs_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="sprofile-speaking"]',
            title: t('tutorial.sprofile_step_speaking_title'),
            content: t('tutorial.sprofile_step_speaking_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
    ];
}

export function getStudentsTourSteps(t: TFunction): Step[] {
    return [
        {
            target: '[data-tour="students-roster"]',
            title: t('tutorial.students_step_roster_title'),
            content: t('tutorial.students_step_roster_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="students-add"]',
            title: t('tutorial.students_step_add_title'),
            content: t('tutorial.students_step_add_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="students-import"]',
            title: t('tutorial.students_step_import_title'),
            content: t('tutorial.students_step_import_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
    ];
}

export function getTutorialSteps(t: TFunction): Step[] {
    return [
        {
            target: 'body',
            title: t('tutorial.step_welcome_title'),
            content: t('tutorial.step_welcome_content'),
            placement: 'center',
            skipBeacon: true,
        },
        {
            target: '.nav-rail',
            title: t('tutorial.step_nav_title'),
            content: t('tutorial.step_nav_content'),
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
            target: '[data-tour="/settings"]',
            title: t('tutorial.step_settings_title'),
            content: t('tutorial.step_settings_content'),
            placement: 'right',
            skipBeacon: true,
        },
        {
            target: '[data-tour="help"]',
            title: t('tutorial.step_help_title'),
            content: t('tutorial.step_help_content'),
            placement: 'right',
            skipBeacon: true,
        },
    ];
}

/** Steps that live inside the sidebar, which is an off-canvas drawer on mobile. */
export const SIDEBAR_TOUR_TARGETS = ['.nav-rail', '[data-tour="/settings"]', '[data-tour="help"]'];

const DRAWER_TRANSITION_MS = 350;

/** On mobile the sidebar is an off-canvas drawer, so it must be open while a step highlights it. */
export function withMobileDrawer(steps: Step[], setDrawerOpen: (open: boolean) => void): Step[] {
    return steps.map((step) => {
        const inDrawer = typeof step.target === 'string' && SIDEBAR_TOUR_TARGETS.includes(step.target);
        return {
            ...step,
            placement: step.target === '.nav-rail' ? 'center' : step.placement,
            before: async () => {
                setDrawerOpen(inDrawer);
                if (inDrawer) await new Promise((resolve) => setTimeout(resolve, DRAWER_TRANSITION_MS));
            },
        };
    });
}
