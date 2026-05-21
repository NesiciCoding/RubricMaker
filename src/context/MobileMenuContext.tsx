import React, { createContext, useContext } from 'react';

interface MobileMenuContextValue {
    open: () => void;
}

export const MobileMenuContext = createContext<MobileMenuContextValue>({ open: () => {} });

export function useMobileMenu() {
    return useContext(MobileMenuContext);
}
