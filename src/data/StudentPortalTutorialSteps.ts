import type { Step } from 'react-joyride';
import type { TFunction } from 'i18next';

export function getStudentPortalTutorialSteps(t: TFunction): Step[] {
    return [
        {
            target: 'body',
            title: t('studentPortal.tour_welcome_title'),
            content: t('studentPortal.tour_welcome_content'),
            placement: 'center',
            skipBeacon: true,
        },
        {
            target: '[data-tour="portal-stats"]',
            title: t('studentPortal.tour_stats_title'),
            content: t('studentPortal.tour_stats_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
        {
            target: '[data-tour="portal-content"]',
            title: t('studentPortal.tour_content_title'),
            content: t('studentPortal.tour_content_content'),
            placement: 'top',
            skipBeacon: true,
        },
        {
            target: '[data-tour="portal-copy-link"]',
            title: t('studentPortal.tour_copy_link_title'),
            content: t('studentPortal.tour_copy_link_content'),
            placement: 'bottom',
            skipBeacon: true,
        },
    ];
}
