import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConfirm } from './useConfirm';

/**
 * Warns before leaving an editor with unsaved changes. Blocks in-app navigation
 * (back button, sidebar, browser back) via useBlocker and tab close via beforeunload.
 * Requires a data router (createHashRouter/RouterProvider) for useBlocker to work.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
    const { t } = useTranslation();
    const { confirm, dialogProps } = useConfirm();

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            isDirty && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        if (blocker.state !== 'blocked') return;
        let cancelled = false;
        confirm({
            title: t('common.unsaved_title'),
            message: t('common.unsaved_message'),
            confirmLabel: t('common.unsaved_leave'),
            cancelLabel: t('common.unsaved_stay'),
        }).then((leave) => {
            if (cancelled) return;
            if (leave) blocker.proceed();
            else blocker.reset();
        });
        return () => {
            cancelled = true;
        };
    }, [blocker, confirm, t]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    return { dialogProps };
}
