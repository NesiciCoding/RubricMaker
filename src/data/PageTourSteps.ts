import type { Step } from 'react-joyride';
import type { TFunction } from 'i18next';

interface StepDef {
    target: string;
    placement?: Step['placement'];
}

/** Step text lives at tutorial.pt_<id>_<n>_title / _content. */
export const PAGE_TOURS = {
    rubrics: [{ target: 'rl-filters' }, { target: 'rl-new' }],
    tests: [{ target: 'tl-filters' }, { target: 'tl-new' }],
    essays: [{ target: 'el-filters' }, { target: 'el-new' }],
    flashcards: [{ target: 'fc-new' }, { target: 'fc-content' }],
    comments: [{ target: 'cb-manager' }],
    attachments: [{ target: 'att-dropzone' }, { target: 'att-rubric' }],
    questions: [{ target: 'qb-manager' }],
    settings: [{ target: 'set-tabs' }, { target: 'set-display' }, { target: 'set-tutorial' }],
    messages: [{ target: 'msg-new' }, { target: 'msg-content' }],
    vocab: [{ target: 'voc-views' }, { target: 'voc-filters' }],
    moderation: [{ target: 'mod-threshold' }, { target: 'mod-content' }],
    news: [{ target: 'nf-new' }, { target: 'nf-content' }],
    market: [{ target: 'mp-intro' }, { target: 'mp-publish' }],
    notifications: [{ target: 'nt-filters' }, { target: 'nt-content' }],
    scefr: [{ target: 'scefr-header' }, { target: 'scefr-grid' }],
    lpath: [{ target: 'slp-header' }, { target: 'slp-recs' }],
    tresults: [{ target: 'tr-summary' }, { target: 'tr-integrity' }, { target: 'tr-questions' }],
    monitor: [{ target: 'lm-controls' }, { target: 'lm-sort' }],
    admin: [{ target: 'admin-tabs' }, { target: 'admin-content' }],
    peerreview: [{ target: 'pr-header' }, { target: 'pr-rounds' }],
    selfassess: [{ target: 'sa-header' }, { target: 'sa-instructions' }, { target: 'sa-descriptors' }],
    peeranalytics: [{ target: 'pa-header' }, { target: 'pa-heatmap' }],
    deck: [{ target: 'fd-settings' }, { target: 'fd-cards' }],
    studyflash: [{ target: 'sf-header' }, { target: 'sf-progress' }, { target: 'sf-session' }],
} satisfies Record<string, StepDef[]>;

export type PageTourId = keyof typeof PAGE_TOURS;

export function getPageTourSteps(t: TFunction, id: PageTourId): Step[] {
    return (PAGE_TOURS[id] as StepDef[]).map((def, i) => ({
        target: `[data-tour="${def.target}"]`,
        title: t(`tutorial.pt_${id}_${i + 1}_title`),
        content: t(`tutorial.pt_${id}_${i + 1}_content`),
        placement: def.placement ?? 'bottom',
        skipBeacon: true,
    }));
}
