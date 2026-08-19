import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PageViewLogger } from '../PageViewLogger';

const { logPageView } = vi.hoisted(() => ({ logPageView: vi.fn() }));

vi.mock('../../../services/logging/clientLogger', () => ({
    logPageView,
}));

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="*" element={<PageViewLogger />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('PageViewLogger', () => {
    beforeEach(() => {
        logPageView.mockClear();
    });

    it('logs the current pathname on mount', () => {
        renderAt('/dashboard');
        expect(logPageView).toHaveBeenCalledWith('/dashboard');
    });
});
