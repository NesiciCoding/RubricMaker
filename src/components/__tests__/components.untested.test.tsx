/**
 * Tests for components that had 0% coverage:
 * CefrOverviewGrid, StandardsCoveragePanel, LoginButtons, MigrationPrompt.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CefrCellData, CefrCellDescriptor, StandardSetGroup } from '../../utils/cefrStudentAggregator';
import CefrOverviewGrid from '../CEFR/CefrOverviewGrid';
import StandardsCoveragePanel from '../Standards/StandardsCoveragePanel';
import LoginButtons from '../auth/LoginButtons';
import MigrationPrompt from '../auth/MigrationPrompt';
import { storageSync } from '../../services/database';

// ─── Hoisted mock refs ────────────────────────────────────────────────────────

const mockDismissMigrationPrompt = vi.hoisted(() => vi.fn(() => Promise.resolve()));

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('../../data/cefrDescriptors', () => ({
    CEFR_LEVELS: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    CEFR_SKILLS: ['reading', 'writing', 'listening', 'speaking_production', 'speaking_interaction'],
    CEFR_SKILL_LABELS: {
        reading: { en: 'Reading', nl: 'Lezen' },
        writing: { en: 'Writing', nl: 'Schrijven' },
        listening: { en: 'Listening', nl: 'Luisteren' },
        speaking_production: { en: 'Speaking', nl: 'Spreken' },
        speaking_interaction: { en: 'Interaction', nl: 'Interactie' },
    },
    CEFR_LEVEL_COLORS: { A1: '#22c55e', A2: '#16a34a', B1: '#3b82f6', B2: '#2563eb', C1: '#f59e0b', C2: '#d97706' },
}));

vi.mock('../../services/database', () => ({
    storageSync: {
        adapter: {
            fetchAuthProviders: vi.fn(() => Promise.resolve(null)),
            signInWithEmail: vi.fn(() => Promise.resolve({ error: null })),
            verifyOtp: vi.fn(() => Promise.resolve({ error: null })),
        },
        subscribe: vi.fn(() => vi.fn()),
        onAuthChange: vi.fn(() => vi.fn()),
        isConnected: vi.fn(() => false),
        getStatus: vi.fn(() => 'idle'),
        getLastSyncAt: vi.fn(() => null),
        getCurrentUserId: vi.fn(() => null),
        signInWithGoogle: vi.fn(() => Promise.resolve({ error: 'OAuth not available in tests' })),
        signInWithMicrosoftPersonal: vi.fn(() => Promise.resolve({})),
        signInWithAzureAD: vi.fn(() => Promise.resolve({})),
    },
}));

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        rubrics: [],
        students: [],
        classes: [],
        showMigrationPrompt: true,
        dismissMigrationPrompt: mockDismissMigrationPrompt,
    }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCell(overrides: Partial<CefrCellData> = {}): CefrCellData {
    return {
        skill: 'reading',
        level: 'B1',
        state: 'not-started',
        rubricCount: 0,
        avgScore: 0,
        threshold: 70,
        confidenceRate: 0,
        rubricAchieved: false,
        totalDescriptors: 0,
        confidentCount: 0,
        descriptors: [],
        ...overrides,
    };
}

function makeDescriptor(overrides: Partial<CefrCellDescriptor> = {}): CefrCellDescriptor {
    return {
        descriptorId: 'd1',
        descriptionEn: 'I can read simple texts',
        descriptionNl: 'Ik kan eenvoudige teksten lezen',
        confidentInSelfAssess: false,
        ...overrides,
    };
}

function makeStandardSet(overrides: Partial<StandardSetGroup> = {}): StandardSetGroup {
    return {
        setTitle: 'CCSS.ELA',
        standards: [
            {
                guid: 'g1',
                statementNotation: 'RL.5.1',
                description: 'Quote accurately from a text',
                rubricCount: 2,
                avgScore: 75,
                standardSetTitle: 'CCSS.ELA',
                jurisdictionTitle: 'Common Core',
            },
        ],
        ...overrides,
    };
}

// ─── CefrOverviewGrid ─────────────────────────────────────────────────────────

describe('CefrOverviewGrid', () => {
    it('renders without crash when cells is empty', () => {
        const { container } = render(<CefrOverviewGrid cells={[]} lang="en" />);
        expect(container.firstChild).toBeTruthy();
    });

    it('renders all skill label headings', () => {
        render(<CefrOverviewGrid cells={[]} lang="en" />);
        expect(screen.getByText('Reading')).toBeInTheDocument();
        expect(screen.getByText('Writing')).toBeInTheDocument();
    });

    it('renders all CEFR level badges in the header', () => {
        render(<CefrOverviewGrid cells={[]} lang="en" />);
        expect(screen.getAllByText('A1').length).toBeGreaterThan(0);
        expect(screen.getAllByText('C2').length).toBeGreaterThan(0);
    });

    it('renders Dutch skill labels when lang=nl', () => {
        render(<CefrOverviewGrid cells={[]} lang="nl" />);
        expect(screen.getByText('Lezen')).toBeInTheDocument();
    });

    it('renders an achieved cell with a rounded percentage score', () => {
        const cell = makeCell({ state: 'achieved', rubricCount: 2, avgScore: 85 });
        render(<CefrOverviewGrid cells={[cell]} lang="en" />);
        expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('renders self-assessment counts when totalDescriptors > 0', () => {
        const cell = makeCell({ totalDescriptors: 3, confidentCount: 2 });
        render(<CefrOverviewGrid cells={[cell]} lang="en" />);
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('/3')).toBeInTheDocument();
    });

    it('highlights the target level in the column header', () => {
        render(<CefrOverviewGrid cells={[]} lang="en" targetLevel="B1" />);
        expect(screen.getByText('cefrOverview.target_level_label')).toBeInTheDocument();
    });

    it('clicking a cell with descriptors expands the detail panel', () => {
        const cell = makeCell({
            state: 'achieved',
            rubricCount: 1,
            avgScore: 90,
            totalDescriptors: 1,
            confidentCount: 1,
            descriptors: [makeDescriptor()],
        });
        render(<CefrOverviewGrid cells={[cell]} lang="en" />);
        fireEvent.click(screen.getByTitle('cefrOverview.cell_achieved'));
        expect(screen.getByText('I can read simple texts')).toBeInTheDocument();
    });

    it('clicking the close button in the expanded panel collapses it', () => {
        const cell = makeCell({
            state: 'achieved',
            rubricCount: 1,
            avgScore: 90,
            totalDescriptors: 1,
            confidentCount: 1,
            descriptors: [makeDescriptor()],
        });
        render(<CefrOverviewGrid cells={[cell]} lang="en" />);
        fireEvent.click(screen.getByTitle('cefrOverview.cell_achieved'));
        expect(screen.getByText('I can read simple texts')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
        expect(screen.queryByText('I can read simple texts')).not.toBeInTheDocument();
    });

    it('clicking the same expanded cell again collapses it', () => {
        const cell = makeCell({
            state: 'achieved',
            rubricCount: 1,
            avgScore: 90,
            totalDescriptors: 1,
            confidentCount: 1,
            descriptors: [makeDescriptor()],
        });
        render(<CefrOverviewGrid cells={[cell]} lang="en" />);
        const btn = screen.getByTitle('cefrOverview.cell_achieved');
        fireEvent.click(btn);
        fireEvent.click(btn);
        expect(screen.queryByText('I can read simple texts')).not.toBeInTheDocument();
    });

    it('renders the legend at the bottom of the grid', () => {
        render(<CefrOverviewGrid cells={[]} lang="en" />);
        expect(screen.getByText('cefrOverview.cell_achieved')).toBeInTheDocument();
        expect(screen.getByText('cefrOverview.cell_developing')).toBeInTheDocument();
        expect(screen.getByText('cefrOverview.cell_not_started')).toBeInTheDocument();
    });

    it('shows confidence labels for descriptors in the expanded panel', () => {
        const cell = makeCell({
            state: 'achieved',
            rubricCount: 1,
            avgScore: 80,
            totalDescriptors: 2,
            confidentCount: 1,
            descriptors: [
                makeDescriptor({ descriptorId: 'd1', descriptionEn: 'Confident desc', confidentInSelfAssess: true }),
                makeDescriptor({
                    descriptorId: 'd2',
                    descriptionEn: 'Not confident desc',
                    confidentInSelfAssess: false,
                }),
            ],
        });
        render(<CefrOverviewGrid cells={[cell]} lang="en" />);
        fireEvent.click(screen.getByTitle('cefrOverview.cell_achieved'));
        expect(screen.getByText('cefrOverview.descriptor_confident')).toBeInTheDocument();
        expect(screen.getByText('cefrOverview.descriptor_not_confident')).toBeInTheDocument();
    });

    it('shows no-data message in expanded panel when descriptors list is empty via expanded click', () => {
        // A cell with state=developing gives 'developing' title, no rubric data but is in cellMap
        const cell = makeCell({
            state: 'developing',
            rubricCount: 0,
            avgScore: 0,
            totalDescriptors: 1,
            confidentCount: 0,
            descriptors: [],
        });
        render(<CefrOverviewGrid cells={[cell]} lang="en" />);
        fireEvent.click(screen.getByTitle('cefrOverview.cell_developing'));
        expect(screen.getByText('cefrOverview.cell_no_data')).toBeInTheDocument();
    });
});

// ─── StandardsCoveragePanel ───────────────────────────────────────────────────

describe('StandardsCoveragePanel', () => {
    it('renders an empty state when standardSets is empty', () => {
        render(<StandardsCoveragePanel standardSets={[]} />);
        expect(screen.getByText('cefrOverview.standards_empty')).toBeInTheDocument();
    });

    it('renders the set title', () => {
        render(<StandardsCoveragePanel standardSets={[makeStandardSet()]} />);
        expect(screen.getByText('CCSS.ELA')).toBeInTheDocument();
    });

    it('renders the standard notation and description', () => {
        render(<StandardsCoveragePanel standardSets={[makeStandardSet()]} />);
        expect(screen.getByText('RL.5.1')).toBeInTheDocument();
        expect(screen.getByText('Quote accurately from a text')).toBeInTheDocument();
    });

    it('shows the rounded average score as a percentage', () => {
        render(<StandardsCoveragePanel standardSets={[makeStandardSet()]} />);
        expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('applies badge-green class for high scores (≥70)', () => {
        const { container } = render(<StandardsCoveragePanel standardSets={[makeStandardSet()]} />);
        expect(container.querySelector('.badge-green')).toBeTruthy();
    });

    it('applies badge-yellow class for medium scores (50–69)', () => {
        const set = makeStandardSet({
            standards: [
                {
                    guid: 'g1',
                    statementNotation: 'S1',
                    description: 'Desc',
                    rubricCount: 1,
                    avgScore: 55,
                    standardSetTitle: 'S',
                    jurisdictionTitle: 'J',
                },
            ],
        });
        const { container } = render(<StandardsCoveragePanel standardSets={[set]} />);
        expect(container.querySelector('.badge-yellow')).toBeTruthy();
    });

    it('applies badge-red class for low scores (<50)', () => {
        const set = makeStandardSet({
            standards: [
                {
                    guid: 'g1',
                    statementNotation: 'S1',
                    description: 'Desc',
                    rubricCount: 1,
                    avgScore: 40,
                    standardSetTitle: 'S',
                    jurisdictionTitle: 'J',
                },
            ],
        });
        const { container } = render(<StandardsCoveragePanel standardSets={[set]} />);
        expect(container.querySelector('.badge-red')).toBeTruthy();
    });

    it('shows the no-score label when rubricCount is 0', () => {
        const set = makeStandardSet({
            standards: [
                {
                    guid: 'g1',
                    statementNotation: 'S1',
                    description: 'Desc',
                    rubricCount: 0,
                    avgScore: 0,
                    standardSetTitle: 'S',
                    jurisdictionTitle: 'J',
                },
            ],
        });
        render(<StandardsCoveragePanel standardSets={[set]} />);
        expect(screen.getByText('cefrOverview.standard_no_score')).toBeInTheDocument();
    });

    it('renders multiple standard sets', () => {
        const sets = [
            makeStandardSet({
                setTitle: 'Set A',
                standards: [
                    {
                        guid: 'g1',
                        statementNotation: 'A.1',
                        description: 'Desc A',
                        rubricCount: 1,
                        avgScore: 80,
                        standardSetTitle: 'Set A',
                        jurisdictionTitle: 'J',
                    },
                ],
            }),
            makeStandardSet({
                setTitle: 'Set B',
                standards: [
                    {
                        guid: 'g2',
                        statementNotation: 'B.1',
                        description: 'Desc B',
                        rubricCount: 1,
                        avgScore: 60,
                        standardSetTitle: 'Set B',
                        jurisdictionTitle: 'J',
                    },
                ],
            }),
        ];
        render(<StandardsCoveragePanel standardSets={sets} />);
        expect(screen.getByText('Set A')).toBeInTheDocument();
        expect(screen.getByText('Set B')).toBeInTheDocument();
    });
});

// ─── LoginButtons ─────────────────────────────────────────────────────────────

describe('LoginButtons', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders without crash when supabaseReady=true', () => {
        const { container } = render(<LoginButtons supabaseReady />);
        expect(container.firstChild).toBeTruthy();
    });

    it('renders without crash when supabaseReady=false', () => {
        const { container } = render(<LoginButtons supabaseReady={false} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('renders the email login section', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => {
            expect(screen.getByText(/email/i)).toBeInTheDocument();
        });
    });

    it('clicking the email toggle expands the email input form', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/email/i));
        fireEvent.click(screen.getByText(/email/i).closest('button') as HTMLButtonElement);
        expect(screen.getByPlaceholderText(/your@email/i)).toBeInTheDocument();
    });

    it('Send login code button is disabled when no email is entered', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/email/i));
        fireEvent.click(screen.getByText(/email/i).closest('button') as HTMLButtonElement);
        expect(screen.getByRole('button', { name: /send login code/i })).toBeDisabled();
    });

    it('calls onNeedConfig when an OAuth button is clicked while supabaseReady=false', async () => {
        const onNeedConfig = vi.fn();
        render(<LoginButtons supabaseReady={false} onNeedConfig={onNeedConfig} />);
        await waitFor(() => screen.getByText(/google/i));
        fireEvent.click(screen.getByText(/google/i).closest('button') as HTMLButtonElement);
        expect(onNeedConfig).toHaveBeenCalled();
    });

    it('toggles email form closed on second click', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/email/i));
        const toggle = screen.getByText(/email/i).closest('button') as HTMLButtonElement;
        fireEvent.click(toggle);
        expect(screen.getByPlaceholderText(/your@email/i)).toBeInTheDocument();
        fireEvent.click(toggle);
        expect(screen.queryByPlaceholderText(/your@email/i)).not.toBeInTheDocument();
    });

    it('changes button background on hover for OAuth buttons', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/school \/ work/i));
        const buttons = screen
            .getAllByRole('button')
            .filter((b) => /sign in with (google|microsoft)/i.test(b.textContent ?? ''));
        expect(buttons.length).toBeGreaterThanOrEqual(3);
        for (const btn of buttons) {
            const restingBackground = btn.style.background;
            fireEvent.mouseEnter(btn);
            expect(btn.style.background).not.toBe(restingBackground);
            fireEvent.mouseLeave(btn);
            expect(btn.style.background).toBe(restingBackground);
        }
    });

    it('shows an error returned from Google OAuth and stops the busy spinner', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/google/i));
        fireEvent.click(screen.getByText(/google/i).closest('button') as HTMLButtonElement);
        await waitFor(() => {
            expect(screen.getByText('OAuth not available in tests')).toBeInTheDocument();
        });
        expect(storageSync.signInWithGoogle).toHaveBeenCalled();
    });

    it('triggers the Microsoft personal OAuth handler', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/school \/ work/i));
        const personalBtn = screen
            .getAllByRole('button')
            .find((b) => /sign in with microsoft/i.test(b.textContent ?? '') && !/school/i.test(b.textContent ?? ''));
        fireEvent.click(personalBtn!);
        expect(storageSync.signInWithMicrosoftPersonal).toHaveBeenCalled();
    });

    it('triggers the Azure AD OAuth handler', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/school \/ work/i));
        const azureBtn = screen.getAllByRole('button').find((b) => /school \/ work/i.test(b.textContent ?? ''));
        fireEvent.click(azureBtn!);
        expect(storageSync.signInWithAzureAD).toHaveBeenCalled();
    });

    it('shows an error when sending the OTP with an empty email via Enter', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/email/i));
        fireEvent.click(screen.getByText(/email/i).closest('button') as HTMLButtonElement);
        const emailInput = screen.getByPlaceholderText(/your@email/i);
        fireEvent.keyDown(emailInput, { key: 'Enter' });
        expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    });

    it('calls onNeedConfig instead of sending an OTP when supabase is not ready', async () => {
        const onNeedConfig = vi.fn();
        render(<LoginButtons supabaseReady={false} onNeedConfig={onNeedConfig} />);
        await waitFor(() => screen.getByText(/email/i));
        fireEvent.click(screen.getByText(/email/i).closest('button') as HTMLButtonElement);
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 'teacher@school.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send login code/i }));
        expect(onNeedConfig).toHaveBeenCalled();
        expect(storageSync.adapter.signInWithEmail).not.toHaveBeenCalled();
    });

    it('sends the OTP, advances to code entry, and verifies it successfully', async () => {
        const onEmailSuccess = vi.fn();
        render(<LoginButtons supabaseReady onEmailSuccess={onEmailSuccess} />);
        await waitFor(() => screen.getByText(/email/i));
        fireEvent.click(screen.getByText(/email/i).closest('button') as HTMLButtonElement);

        const emailInput = screen.getByPlaceholderText(/your@email/i);
        fireEvent.change(emailInput, { target: { value: 'teacher@school.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send login code/i }));

        await waitFor(() => expect(storageSync.adapter.signInWithEmail).toHaveBeenCalledWith('teacher@school.com'));
        await waitFor(() => screen.getByPlaceholderText('12345678'));
        expect(screen.getByText('teacher@school.com')).toBeInTheDocument();

        const otpInput = screen.getByPlaceholderText('12345678');
        fireEvent.change(otpInput, { target: { value: 'ab12cd34' } });
        expect((otpInput as HTMLInputElement).value).toBe('1234');

        fireEvent.change(otpInput, { target: { value: '12345678' } });
        fireEvent.click(screen.getByRole('button', { name: /verify code/i }));

        await waitFor(() =>
            expect(storageSync.adapter.verifyOtp).toHaveBeenCalledWith('teacher@school.com', '12345678')
        );
        await waitFor(() => expect(screen.getByText(/signed in/i)).toBeInTheDocument());
        expect(onEmailSuccess).toHaveBeenCalled();
    });

    it('shows an error when the OTP code is too short and submitted via Enter', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/email/i));
        fireEvent.click(screen.getByText(/email/i).closest('button') as HTMLButtonElement);
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 'teacher@school.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send login code/i }));

        await waitFor(() => screen.getByPlaceholderText('12345678'));
        const otpInput = screen.getByPlaceholderText('12345678');
        fireEvent.change(otpInput, { target: { value: '123' } });
        fireEvent.keyDown(otpInput, { key: 'Enter' });
        expect(screen.getByText('Enter the 8-digit code.')).toBeInTheDocument();
    });

    it('returns to the email step when Back is clicked', async () => {
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/email/i));
        fireEvent.click(screen.getByText(/email/i).closest('button') as HTMLButtonElement);
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 'teacher@school.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send login code/i }));

        await waitFor(() => screen.getByPlaceholderText('12345678'));
        fireEvent.click(screen.getByRole('button', { name: /back/i }));
        expect(screen.getByPlaceholderText(/your@email/i)).toBeInTheDocument();
    });

    it('shows an error returned by signInWithEmail', async () => {
        vi.mocked(storageSync.adapter.signInWithEmail).mockResolvedValueOnce({ error: 'Too many requests' });
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/email/i));
        fireEvent.click(screen.getByText(/email/i).closest('button') as HTMLButtonElement);
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 'teacher@school.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send login code/i }));
        await waitFor(() => expect(screen.getByText('Too many requests')).toBeInTheDocument());
    });

    it('shows an error returned by verifyOtp and clears it when the email changes', async () => {
        vi.mocked(storageSync.adapter.verifyOtp).mockResolvedValueOnce({ error: 'Invalid code' });
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/email/i));
        fireEvent.click(screen.getByText(/email/i).closest('button') as HTMLButtonElement);
        fireEvent.change(screen.getByPlaceholderText(/your@email/i), { target: { value: 'teacher@school.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send login code/i }));

        await waitFor(() => screen.getByPlaceholderText('12345678'));
        const otpInput = screen.getByPlaceholderText('12345678');
        fireEvent.change(otpInput, { target: { value: '12345678' } });
        fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
        await waitFor(() => expect(screen.getByText('Invalid code')).toBeInTheDocument());

        fireEvent.change(otpInput, { target: { value: '87654321' } });
        expect(screen.queryByText('Invalid code')).not.toBeInTheDocument();
    });

    it('only renders providers present in enabledProviders once loaded', async () => {
        vi.mocked(storageSync.adapter.fetchAuthProviders).mockResolvedValueOnce(['google', 'email']);
        render(<LoginButtons supabaseReady />);
        await waitFor(() => screen.getByText(/sign in with google/i));
        expect(screen.queryByText(/sign in with microsoft/i)).not.toBeInTheDocument();
        expect(screen.getByText(/sign in with email/i)).toBeInTheDocument();
    });
});

// ─── MigrationPrompt ──────────────────────────────────────────────────────────

describe('MigrationPrompt', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders without crash when showMigrationPrompt=true', () => {
        render(<MigrationPrompt />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('shows the upload prompt heading', () => {
        render(<MigrationPrompt />);
        expect(screen.getByText(/upload local data/i)).toBeInTheDocument();
    });

    it('renders the Skip for now button', () => {
        render(<MigrationPrompt />);
        expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
    });

    it('renders the Upload to account button', () => {
        render(<MigrationPrompt />);
        expect(screen.getByRole('button', { name: /upload to account/i })).toBeInTheDocument();
    });

    it('clicking Skip calls dismissMigrationPrompt(false)', () => {
        render(<MigrationPrompt />);
        fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
        expect(mockDismissMigrationPrompt).toHaveBeenCalledWith(false);
    });

    it('clicking Upload calls dismissMigrationPrompt(true)', async () => {
        render(<MigrationPrompt />);
        fireEvent.click(screen.getByRole('button', { name: /upload to account/i }));
        await waitFor(() => {
            expect(mockDismissMigrationPrompt).toHaveBeenCalledWith(true);
        });
    });
});
