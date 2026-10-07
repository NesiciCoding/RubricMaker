import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConfirm } from './useConfirm';

/**
 * Warns before leaving an editor with unsaved changes. Blocks in-app navigation
 * (back button, sidebar, browser back) via useBlocker and tab close via beforeunload.
 * Requires a data router (createHashRouter/RouterProvider) for useBlocker to work.
 *
 * Call `allowNavigation()` right before a navigation that follows a save or an intentional
 * discard: a `setDirty(false)` in the same handler hasn't re-rendered yet, so the blocker would
 * otherwise still see the page as dirty.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
    const { t } = useTranslation();
    const { confirm, dialogProps } = useConfirm();
    const { pathname } = useLocation();
    const bypassRef = useRef(false);

    useEffect(() => {
        bypassRef.current = false;
    }, [pathname]);

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            !bypassRef.current && isDirty && currentLocation.pathname !== nextLocation.pathname
    );

    const allowNavigation = useCallback(() => {
        bypassRef.current = true;
    }, []);

    // Keyed on the blocker state only: re-running on a new `t`/`confirm` identity would re-open the dialog.
    const latest = useRef({ blocker, confirm, t });
    useEffect(() => {
        latest.current = { blocker, confirm, t };
    });
    useEffect(() => {
        if (blocker.state !== 'blocked') return;
        let cancelled = false;
        const { confirm: ask, t: tr } = latest.current;
        ask({
            title: tr('common.unsaved_title'),
            message: tr('common.unsaved_message'),
            confirmLabel: tr('common.unsaved_leave'),
            cancelLabel: tr('common.unsaved_stay'),
        }).then((leave) => {
            if (cancelled) return;
            if (leave) latest.current.blocker.proceed?.();
            else latest.current.blocker.reset?.();
        });
        return () => {
            cancelled = true;
        };
    }, [blocker.state]);

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

    return { dialogProps, allowNavigation };
}
