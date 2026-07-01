import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import RouteSkeleton from '../RouteSkeleton';

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="*" element={<RouteSkeleton />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('RouteSkeleton', () => {
    it('renders a skeleton for the root path', () => {
        const { container } = renderAt('/');
        expect(container.firstChild).toBeTruthy();
    });

    it('renders a skeleton for a rubrics builder path', () => {
        const { container } = renderAt('/rubrics/r1');
        expect(container.firstChild).toBeTruthy();
    });

    it('renders a skeleton for the statistics path', () => {
        const { container } = renderAt('/statistics');
        expect(container.firstChild).toBeTruthy();
    });

    it('renders a skeleton for a student profile path', () => {
        const { container } = renderAt('/students/s1');
        expect(container.firstChild).toBeTruthy();
    });

    it('renders a skeleton for the tests list path', () => {
        const { container } = renderAt('/tests');
        expect(container.firstChild).toBeTruthy();
    });

    it('renders a list skeleton for an unknown path', () => {
        const { container } = renderAt('/unknown-route');
        expect(container.firstChild).toBeTruthy();
    });
});
