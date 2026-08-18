import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { logPageView } from '../../services/logging/clientLogger';

export function PageViewLogger() {
    const location = useLocation();
    useEffect(() => {
        logPageView(location.pathname);
    }, [location.pathname]);
    return null;
}
