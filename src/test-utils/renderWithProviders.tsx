import React, { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

interface Options extends Omit<RenderOptions, 'wrapper'> {
    initialRoute?: string;
}

export function renderWithRouter(ui: React.ReactElement, { initialRoute = '/', ...options }: Options = {}) {
    function Wrapper({ children }: { children: ReactNode }) {
        return <MemoryRouter initialEntries={[initialRoute]}>{children}</MemoryRouter>;
    }
    return render(ui, { wrapper: Wrapper, ...options });
}
