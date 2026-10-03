import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPageTourSteps, type PageTourId } from '../data/PageTourSteps';

export function usePageTourState(id: PageTourId) {
    const { t } = useTranslation();
    const [run, setRun] = useState(false);
    const steps = useMemo(() => getPageTourSteps(t, id), [t, id]);
    const start = useCallback(() => setRun(true), []);
    const finish = useCallback(() => setRun(false), []);

    return {
        start,
        tourProps: { steps, run, onFinish: finish, onStartRequest: start },
    };
}
