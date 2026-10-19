import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { AppShellSkeleton, BootShellSkeleton } from '../AppShellSkeleton';

describe('AppShellSkeleton', () => {
    it('renders the sidebar frame, the status line and a route-shaped skeleton', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/statistics']}>
                <AppShellSkeleton statusText="Loading things" />
            </MemoryRouter>
        );
        expect(container.querySelector('.app-layout')).toBeTruthy();
        expect(container.querySelector('.sidebar')).toBeTruthy();
        expect(screen.getByText('Loading things')).toBeInTheDocument();
        expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    });

    it('exposes exactly one status region so the phase is announced once', () => {
        render(
            <MemoryRouter initialEntries={['/statistics']}>
                <AppShellSkeleton statusText="Loading things" />
            </MemoryRouter>
        );
        expect(screen.getAllByRole('status')).toHaveLength(1);
    });

    it('keeps the busy state off the status region so the phase update is announced', () => {
        render(
            <MemoryRouter initialEntries={['/statistics']}>
                <AppShellSkeleton statusText="Loading things" />
            </MemoryRouter>
        );
        expect(screen.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
    });

    it('marks itself as the boot shell for the startup e2e specs', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/statistics']}>
                <AppShellSkeleton statusText="Loading things" />
            </MemoryRouter>
        );
        expect(container.querySelector('[data-boot-shell="true"]')).toBeTruthy();
    });
});

describe('BootShellSkeleton', () => {
    it('renders without a router', () => {
        const { container } = render(<BootShellSkeleton />);
        expect(container.querySelector('.app-layout')).toBeTruthy();
        expect(container.querySelector('.sidebar')).toBeTruthy();
        expect(screen.getAllByRole('status')).toHaveLength(1);
        expect(container.querySelector('[data-boot-shell="true"]')).toBeTruthy();
    });
});
