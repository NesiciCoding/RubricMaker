import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import SebGate from '../SebGate';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('../../../utils/sebConfig', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../utils/sebConfig')>();
    return { ...actual, downloadSebConfigForAssignment: vi.fn() };
});

import { downloadSebConfigForAssignment } from '../../../utils/sebConfig';

function stubUserAgent(ua: string) {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

describe('SebGate', () => {
    const originalUserAgent = window.navigator.userAgent;

    afterEach(() => {
        stubUserAgent(originalUserAgent);
        vi.mocked(downloadSebConfigForAssignment).mockReset();
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

    it('gives the student a way into SEB: instructions, install link and config download', async () => {
        stubUserAgent('Mozilla/5.0 (regular browser)');
        render(
            <SebGate requireSEB={true} startUrl="https://app/#/test/abc" fileName="Unit 3 test">
                <div>protected content</div>
            </SebGate>
        );

        expect(screen.getByText('tests.taking.seb_step_install')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.seb_step_download')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.seb_step_open')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /tests\.taking\.seb_get_app/ })).toHaveAttribute(
            'href',
            'https://safeexambrowser.org/download_en.html'
        );

        fireEvent.click(screen.getByRole('button', { name: /tests\.taking\.seb_download_config/ }));

        await waitFor(() =>
            expect(downloadSebConfigForAssignment).toHaveBeenCalledWith({
                endpoint: undefined,
                startUrl: 'https://app/#/test/abc',
                fileName: 'Unit 3 test',
            })
        );
    });

    it('passes the assignment endpoint so the server builds an identical config', async () => {
        stubUserAgent('Mozilla/5.0 (regular browser)');
        const configEndpoint = { supabaseUrl: 'https://sb.example', code: 'abc123xyzQ', apikey: 'anon-key' };

        render(
            <SebGate
                requireSEB={true}
                startUrl="https://app/#/test/abc"
                fileName="Unit 3 test"
                configEndpoint={configEndpoint}
            >
                <div>protected content</div>
            </SebGate>
        );

        fireEvent.click(screen.getByRole('button', { name: /tests\.taking\.seb_download_config/ }));

        await waitFor(() =>
            expect(downloadSebConfigForAssignment).toHaveBeenCalledWith({
                endpoint: configEndpoint,
                startUrl: 'https://app/#/test/abc',
                fileName: 'Unit 3 test',
            })
        );
    });

    it('omits the config download when no start URL is supplied', () => {
        stubUserAgent('Mozilla/5.0 (regular browser)');
        render(
            <SebGate requireSEB={true}>
                <div>protected content</div>
            </SebGate>
        );
        expect(screen.queryByRole('button', { name: /seb_download_config/ })).not.toBeInTheDocument();
    });
});
