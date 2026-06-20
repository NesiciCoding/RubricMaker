import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

interface Options extends Omit<RenderOptions, 'wrapper'> {
    initialRoute?: string;
}

// A data router (not MemoryRouter) so hooks like useBlocker have the required context.
export function renderWithRouter(ui: React.ReactElement, { initialRoute = '/', ...options }: Options = {}) {
    const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [initialRoute] });
    return render(<RouterProvider router={router} />, options);
}
