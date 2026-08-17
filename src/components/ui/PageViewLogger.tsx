import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { logPageView } from '../../services/logging/clientLogger';

/** Emits a pageview event for every in-app route change. No-op unless stress-test logging is enabled. */
export function PageViewLogger() {
    const location = useLocation();
    useEffect(() => {
        logPageView(location.pathname + location.search);
    }, [location.pathname, location.search]);
    return null;
}
