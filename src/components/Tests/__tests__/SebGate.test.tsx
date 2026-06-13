import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import SebGate from '../SebGate';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

function stubUserAgent(ua: string) {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

describe('SebGate', () => {
    const originalUserAgent = window.navigator.userAgent;

    afterEach(() => {
        stubUserAgent(originalUserAgent);
    });

    it('renders children when requireSEB is false, regardless of user agent', () => {
        stubUserAgent('Mozilla/5.0 (regular browser)');
        render(
            <SebGate requireSEB={false}>
                <div>protected content</div>
            </SebGate>
        );
        expect(screen.getByText('protected content')).toBeInTheDocument();
    });

    it('renders children when requireSEB is true and running inside SEB', () => {
        stubUserAgent('Mozilla/5.0 SEB/3.4 (SafeExamBrowser)');
        render(
            <SebGate requireSEB={true}>
                <div>protected content</div>
            </SebGate>
        );
        expect(screen.getByText('protected content')).toBeInTheDocument();
    });

    it('renders the blocked screen when requireSEB is true and not running inside SEB', () => {
        stubUserAgent('Mozilla/5.0 (regular browser)');
        render(
            <SebGate requireSEB={true}>
                <div>protected content</div>
            </SebGate>
        );
        expect(screen.queryByText('protected content')).not.toBeInTheDocument();
        expect(screen.getByText('tests.taking.seb_blocked_title')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.seb_blocked_desc')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.seb_blocked_no_bypass')).toBeInTheDocument();
    });
});
