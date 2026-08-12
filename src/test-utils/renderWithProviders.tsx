import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';

interface Options extends Omit<RenderOptions, 'wrapper'> {
    initialRoute?: string;
    withAppProvider?: boolean;
}

// A data router (not MemoryRouter) so hooks like useBlocker have the required context.
// `withAppProvider` wraps the UI in the real AppProvider — for provider-contract tests that
// exercise actual context dispatch (most page/component tests mock AppContext instead).
export function renderWithRouter(
    ui: React.ReactElement,
    { initialRoute = '/', withAppProvider = false, ...options }: Options = {}
) {
    const element = withAppProvider ? <AppProvider>{ui}</AppProvider> : ui;
    const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [initialRoute] });
    return render(<RouterProvider router={router} />, options);
}
