import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from './useToast';

/** Copies text and reports the outcome; on failure the toast offers the text for manual copying. */
export function useCopyFeedback() {
    const { t } = useTranslation();
    const { showToast } = useToast();
    return useCallback(
        async (text: string) => {
            try {
                if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
                await navigator.clipboard.writeText(text);
                showToast(t('gradeStudent.menu_feedback_copied'), 'success');
            } catch {
                showToast(t('gradeStudent.menu_feedback_copy_failed'), 'error', {
                    action: {
                        label: t('gradeStudent.menu_feedback_copy_manual'),
                        onClick: () => window.prompt(t('gradeStudent.menu_feedback_copy_manual_prompt'), text),
                    },
                    durationMs: 10_000,
                });
            }
        },
        [showToast, t]
    );
}
