import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface TourContextValue {
    hasPageTour: boolean;
    startPageTour: () => void;
    registerPageTour: (start: () => void) => () => void;
}

const TourContext = createContext<TourContextValue>({
    hasPageTour: false,
    startPageTour: () => {},
    registerPageTour: () => () => {},
});

export function TourProvider({ children }: { children: ReactNode }) {
    const [starter, setStarter] = useState<(() => void) | null>(null);

    const registerPageTour = useCallback((start: () => void) => {
        setStarter(() => start);
        return () => setStarter((current) => (current === start ? null : current));
    }, []);

    const value = useMemo<TourContextValue>(
        () => ({ hasPageTour: starter !== null, startPageTour: () => starter?.(), registerPageTour }),
        [starter, registerPageTour]
    );

    return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function usePageTourRegistry() {
    return useContext(TourContext);
}
