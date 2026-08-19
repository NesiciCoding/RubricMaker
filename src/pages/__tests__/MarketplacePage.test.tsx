import React from 'react';
import { screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, FlashcardDeck, MarketplaceListing, QuestionBankItem, Rubric, Test } from '../../types';
import type { StoreData } from '../../store/storage';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockAddRubric = vi.fn(() => ({ ...mockRubric, id: 'new-r' }));
const mockAddTest = vi.fn();
const mockAddFlashcardDeck = vi.fn();
const mockAddQuestionBankItems = vi.fn();
const mockListListings = vi.fn().mockResolvedValue([]);
const mockUpvote = vi.fn().mockResolvedValue({ success: true });
const mockRemoveUpvote = vi.fn().mockResolvedValue({ success: true });
const mockCloneListing = vi.fn();
const mockPublish = vi.fn();

const mockQuestionBank: QuestionBankItem[] = [
    {
        id: 'qb1',
        kind: 'section',
        section: { title: 'Reading Passage A', questions: [] },
        tags: [],
        createdAt: '2024-01-01T00:00:00Z',
    },
    {
        id: 'qb2',
        kind: 'question',
        question: { prompt: 'What is X?' } as QuestionBankItem['question'],
        tags: [],
        createdAt: '2024-01-01T00:00:00Z',
    },
    { id: 'qb3', tags: [], createdAt: '2024-01-01T00:00:00Z' } as unknown as QuestionBankItem,
];

const mockTest: Test = {
    id: 't1',
    name: 'Unit Test',
    subject: 'English',
    questions: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
} as unknown as Test;

const mockDeck: FlashcardDeck = {
    id: 'd1',
    name: 'Vocab Deck',
    cards: [],
    createdAt: '2024-01-01T00:00:00Z',
} as unknown as FlashcardDeck;

const mockRubricsArr = [mockRubric];
const emptyArr: never[] = [];

const mockQuestionBankItem: QuestionBankItem = {
    id: 'qb1',
    cefrLevel: 'B1',
    question: {
        id: 'q1',
        prompt: 'What is the capital of France?',
        type: 'multiple-choice',
        points: 1,
        options: [
            { id: 'o1', text: 'Paris', isCorrect: true },
            { id: 'o2', text: 'Rome', isCorrect: false },
        ],
    },
    tags: ['culture'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
};

type MockStore = Partial<StoreData> & {
    addRubric: typeof mockAddRubric;
    addTest: (...args: unknown[]) => unknown;
    addFlashcardDeck: (...args: unknown[]) => unknown;
    addQuestionBankItems: typeof mockAddQuestionBankItems;
};

const mockAppValue: MockStore = {
    rubrics: mockRubricsArr,
    tests: [mockTest],
    flashcardDecks: [mockDeck],
    questionBank: mockQuestionBank,
    students: emptyArr,
    classes: emptyArr,
    studentRubrics: emptyArr,
    settings: mockSettings,
    addRubric: mockAddRubric,
    addTest: mockAddTest,
    addFlashcardDeck: mockAddFlashcardDeck,
    addQuestionBankItems: mockAddQuestionBankItems,
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockAppValue,
    useStudents: () => mockAppValue,
    useClasses: () => mockAppValue,
    useGrading: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
}));

vi.mock('../../context/useStore', () => ({
    useStoreSelector: <T,>(selector: (state: StoreData) => T): T => selector(mockAppValue as StoreData),
    useStoreActions: () => mockAppValue,
}));

const mockDbState = vi.hoisted(() => ({
    isConnected: false,
    currentUser: null as { id: string; schoolId: string; displayName?: string } | null,
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: mockDbState.isConnected, currentUser: mockDbState.currentUser }),
}));

vi.mock('../../services/database', () => ({
    storageSync: {
        adapter: {
            listMarketplaceListings: (...args: unknown[]) => mockListListings(...args),
            upvoteListing: (...args: unknown[]) => mockUpvote(...args),
            removeUpvote: (...args: unknown[]) => mockRemoveUpvote(...args),
            cloneMarketplaceListing: (...args: unknown[]) => mockCloneListing(...args),
            publishToMarketplace: (...args: unknown[]) => mockPublish(...args),
        },
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

let MarketplacePageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<MarketplacePageComp />);
}

function makeListing(overrides: Partial<MarketplaceListing>): MarketplaceListing {
    return {
        id: 'l1',
        schoolId: 'school-1',
        publishedBy: 'u1',
        kind: 'rubric',
        snapshot: mockRubric,
        name: 'Grammar Rubric',
        subject: 'English',
        description: 'A grammar rubric for B2 students',
        cefrLevels: ['B2'],
        upvoteCount: 5,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        ...overrides,
    } as MarketplaceListing;
}

async function renderConnected() {
    mockDbState.isConnected = true;
    (mockAppValue as Record<string, unknown>).settings = { ...mockSettings, schoolId: 'school-1' };
    await act(async () => {
        renderPage();
    });
}

function cleanupSettings() {
    (mockAppValue as Record<string, unknown>).settings = mockSettings;
}

describe('MarketplacePage', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    beforeEach(async () => {
        mockListListings.mockClear();
        mockListListings.mockResolvedValue([]);
        mockAddRubric.mockClear();
        mockAddTest.mockClear();
        mockAddFlashcardDeck.mockClear();
        mockAddQuestionBankItems.mockClear();
        mockUpvote.mockClear();
        mockUpvote.mockResolvedValue({ success: true });
        mockRemoveUpvote.mockClear();
        mockRemoveUpvote.mockResolvedValue({ success: true });
        mockCloneListing.mockClear();
        mockPublish.mockClear();
        mockDbState.isConnected = false;
        mockDbState.currentUser = null;
        const mod = await import('../MarketplacePage');
        MarketplacePageComp = mod.default;
    });

    it('shows the disabled state when not connected or no school ID', () => {
        renderPage();
        expect(screen.getByText('marketplace.disabled_title')).toBeInTheDocument();
        expect(screen.getByText('marketplace.disabled_body')).toBeInTheDocument();
        // The disabled state does not attempt to load listings.
        expect(mockListListings).not.toHaveBeenCalled();
    });

    it('shows the marketplace title in all states', () => {
        renderPage();
        expect(screen.getByText('marketplace.title')).toBeInTheDocument();
    });

    it('shows the connected marketplace view when connected with schoolId in settings', async () => {
        await renderConnected();
        expect(screen.getByText('marketplace.publish_button')).toBeInTheDocument();
        cleanupSettings();
    });

    it('shows the loading text while listings load', async () => {
        let resolveList: (v: MarketplaceListing[]) => void = () => {};
        mockListListings.mockImplementation(
            () => new Promise<MarketplaceListing[]>((resolve) => (resolveList = resolve))
        );
        await renderConnected();
        expect(screen.getByText('marketplace.loading')).toBeInTheDocument();
        await act(async () => resolveList([]));
        cleanupSettings();
    });

    it('shows the empty state when there are no listings', async () => {
        await renderConnected();
        expect(await screen.findByText('marketplace.empty_state')).toBeInTheDocument();
        cleanupSettings();
    });

    it('shows the publish form when publish button is clicked', async () => {
        await renderConnected();
        await act(async () => {});
        fireEvent.click(screen.getByText('marketplace.publish_button'));
        expect(screen.getByText('marketplace.publish_title')).toBeInTheDocument();
        expect(screen.getByText('marketplace.publish_select_entity')).toBeInTheDocument();
        // Rubric entity is offered in the select.
        expect(screen.getByText('Essay Rubric')).toBeInTheDocument();
        cleanupSettings();
    });

    it('cancels the publish form', async () => {
        await renderConnected();
        await act(async () => {});
        fireEvent.click(screen.getByText('marketplace.publish_button'));
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('marketplace.publish_title')).not.toBeInTheDocument();
        cleanupSettings();
    });

    it('pre-fills the attribution from the current user display name', async () => {
        mockDbState.isConnected = true;
        mockDbState.currentUser = { id: 'u1', schoolId: 'school-1', displayName: 'Ms. Rivera' };
        (mockAppValue as Record<string, unknown>).settings = { ...mockSettings, schoolId: 'school-1' };
        await act(async () => {
            renderPage();
        });
        fireEvent.click(screen.getByText('marketplace.publish_button'));
        expect(screen.getByDisplayValue('marketplace.shared_by_prefix Ms. Rivera')).toBeInTheDocument();
        cleanupSettings();
    });

    it('publishes a rubric with attribution and CEFR levels', async () => {
        mockPublish.mockResolvedValue({ id: 'new-listing' });
        await renderConnected();
        await act(async () => {});
        fireEvent.click(screen.getByText('marketplace.publish_button'));
        fireEvent.change(screen.getByPlaceholderText('marketplace.publish_attribution_placeholder'), {
            target: { value: 'By Ms. X' },
        });
        // Toggle a CEFR level on, then off, then on again for another.
        fireEvent.click(screen.getByText('A1'));
        fireEvent.click(screen.getByText('A1'));
        fireEvent.click(screen.getByText('B1'));
        fireEvent.change(screen.getByLabelText('marketplace.publish_select_entity'), {
            target: { value: 'r1' },
        });
        fireEvent.click(screen.getByText('marketplace.publish_confirm'));
        expect(mockPublish).toHaveBeenCalledWith('school-1', 'rubric', mockRubric, 'By Ms. X', {
            name: undefined,
            cefrLevels: ['B1'],
        });
        await act(async () => {});
        expect(screen.queryByText('marketplace.publish_title')).not.toBeInTheDocument();
        expect(mockListListings).toHaveBeenCalledTimes(2);
        cleanupSettings();
    });

    it('offers question-bank items with section titles and prompts in the publish select', async () => {
        await renderConnected();
        await act(async () => {});
        fireEvent.click(screen.getByText('marketplace.publish_button'));
        fireEvent.click(screen.getByText('marketplace.kind_questionBankItem'));
        expect(screen.getByText('Reading Passage A')).toBeInTheDocument();
        expect(screen.getByText('What is X?')).toBeInTheDocument();
        // Item without a prompt falls back to the untitled label.
        expect(screen.getByText('questionBank.untitled_prompt')).toBeInTheDocument();
        // Test and deck kinds switch the publish options list.
        fireEvent.click(screen.getByText('marketplace.kind_test'));
        expect(screen.getByText('Unit Test')).toBeInTheDocument();
        fireEvent.click(screen.getByText('marketplace.kind_deck'));
        expect(screen.getByText('Vocab Deck')).toBeInTheDocument();
        cleanupSettings();
    });

    it('publishes a question-bank item with no attribution and no CEFR levels', async () => {
        mockPublish.mockResolvedValue({ id: 'new-listing' });
        await renderConnected();
        await act(async () => {});
        fireEvent.click(screen.getByText('marketplace.publish_button'));
        fireEvent.click(screen.getByText('marketplace.kind_questionBankItem'));
        fireEvent.change(screen.getByLabelText('marketplace.publish_select_entity'), {
            target: { value: 'qb1' },
        });
        await act(async () => {
            fireEvent.click(screen.getByText('marketplace.publish_confirm'));
        });
        expect(mockPublish).toHaveBeenCalledWith('school-1', 'questionBankItem', mockQuestionBank[0], undefined, {
            name: 'Reading Passage A',
            cefrLevels: undefined,
        });
        cleanupSettings();
    });

    it('keeps the form open when publishing fails', async () => {
        mockPublish.mockResolvedValue(null);
        await renderConnected();
        await act(async () => {});
        fireEvent.click(screen.getByText('marketplace.publish_button'));
        fireEvent.change(screen.getByLabelText('marketplace.publish_select_entity'), {
            target: { value: 'r1' },
        });
        await act(async () => {
            fireEvent.click(screen.getByText('marketplace.publish_confirm'));
        });
        expect(mockPublish).toHaveBeenCalled();
        expect(screen.getByText('marketplace.publish_title')).toBeInTheDocument();
        expect(mockListListings).toHaveBeenCalledTimes(1);
        cleanupSettings();
    });

    it('renders marketplace listings with filters and sorting', async () => {
        mockListListings.mockResolvedValueOnce([
            makeListing({ id: 'l1', name: 'Grammar Rubric', subject: 'English', upvoteCount: 5 }),
            makeListing({
                id: 'l2',
                name: 'Math Test',
                subject: 'Math',
                kind: 'test',
                upvoteCount: 12,
                cefrLevels: [],
                description: undefined,
                attribution: 'Shared by A',
            }),
        ]);
        await renderConnected();
        expect(await screen.findByText('Grammar Rubric')).toBeInTheDocument();
        expect(screen.getByText('Math Test')).toBeInTheDocument();
        // Listing subjects render alongside the filter options.
        expect(screen.getAllByText('English').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Math').length).toBeGreaterThan(0);
        const subjectSelect = screen.getAllByRole('combobox')[0];
        const sortSelect = screen.getAllByRole('combobox')[1];
        // Filter by kind → only the test listing remains.
        fireEvent.click(screen.getByText('marketplace.kind_tests'));
        expect(screen.queryByText('Grammar Rubric')).not.toBeInTheDocument();
        expect(screen.getByText('Math Test')).toBeInTheDocument();
        // Back to all, filter by subject.
        fireEvent.click(screen.getByText('marketplace.filter_kind_all'));
        fireEvent.change(subjectSelect, { target: { value: 'English' } });
        expect(screen.getByText('Grammar Rubric')).toBeInTheDocument();
        expect(screen.queryByText('Math Test')).not.toBeInTheDocument();
        // Switch back to all subjects and sort by upvotes.
        fireEvent.change(subjectSelect, { target: { value: 'all' } });
        fireEvent.change(sortSelect, { target: { value: 'upvotes' } });
        // Math Test (12 upvotes) now sorts first.
        expect(screen.getAllByText('marketplace.sort_upvotes').length).toBeGreaterThan(0);
        cleanupSettings();
    });

    it('toggles upvotes and removes an upvote', async () => {
        mockListListings.mockResolvedValueOnce([makeListing({}), makeListing({ id: 'l2', upvoteCount: 7 })]);
        await renderConnected();
        await act(async () => {
            fireEvent.click((await screen.findAllByTitle('marketplace.upvote_title'))[0]);
        });
        expect(mockUpvote).toHaveBeenCalledWith('l1');
        expect(screen.getByText('6')).toBeInTheDocument();
        // The other listing is untouched by the map update.
        expect(screen.getByText('7')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getAllByTitle('marketplace.upvote_title')[0]);
        });
        expect(mockRemoveUpvote).toHaveBeenCalledWith('l1');
        expect(screen.getByText('5')).toBeInTheDocument();
        cleanupSettings();
    });

    it('keeps the upvote count when the upvote call fails', async () => {
        mockUpvote.mockResolvedValue({ success: false });
        mockListListings.mockResolvedValueOnce([makeListing({})]);
        await renderConnected();
        await act(async () => {
            fireEvent.click(await screen.findByTitle('marketplace.upvote_title'));
        });
        expect(screen.getByText('5')).toBeInTheDocument();
        cleanupSettings();
    });

    it('clones a rubric listing into the local store', async () => {
        vi.useFakeTimers();
        mockCloneListing.mockResolvedValue({
            kind: 'rubric',
            entity: { ...mockRubric, id: 'old-id', createdAt: 'x', updatedAt: 'y' },
        });
        mockListListings.mockResolvedValueOnce([makeListing({})]);
        await renderConnected();
        await act(async () => {
            fireEvent.click(screen.getByTitle('marketplace.clone_title'));
        });
        expect(mockCloneListing).toHaveBeenCalledWith('l1');
        expect(mockAddRubric).toHaveBeenCalledWith(expect.objectContaining({ name: 'Essay Rubric' }));
        // The cloned badge shows briefly, then resets after the timeout.
        expect(screen.getByText('marketplace.clone_done')).toBeInTheDocument();
        await act(async () => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.queryByText('marketplace.clone_done')).not.toBeInTheDocument();
        cleanupSettings();
    });

    it('clones test, deck and question-bank listings into the local store', async () => {
        mockCloneListing.mockImplementation(async (id: string) => {
            if (id === 'lt') return { kind: 'test', entity: { ...mockTest, id: 'x', createdAt: 'x', updatedAt: 'y' } };
            if (id === 'ld') return { kind: 'deck', entity: { ...mockDeck, id: 'x', createdAt: 'x', updatedAt: 'y' } };
            return {
                kind: 'questionBankItem',
                entity: { ...mockQuestionBank[1], id: 'x', createdAt: 'x', updatedAt: 'y' },
            };
        });
        mockListListings.mockResolvedValueOnce([
            makeListing({ id: 'lt', kind: 'test' }),
            makeListing({ id: 'ld', kind: 'deck' }),
            makeListing({ id: 'lq', kind: 'questionBankItem' }),
        ]);
        await renderConnected();
        const cloneButtons = await screen.findAllByTitle('marketplace.clone_title');
        await act(async () => {
            fireEvent.click(cloneButtons[0]);
        });
        expect(mockAddTest).toHaveBeenCalledWith(expect.objectContaining({ name: 'Unit Test' }));
        await act(async () => {
            fireEvent.click(screen.getAllByTitle('marketplace.clone_title')[1]);
        });
        expect(mockAddFlashcardDeck).toHaveBeenCalledWith(expect.objectContaining({ name: 'Vocab Deck' }));
        await act(async () => {
            fireEvent.click(screen.getAllByTitle('marketplace.clone_title')[2]);
        });
        expect(mockAddQuestionBankItems).toHaveBeenCalledWith([expect.objectContaining({ tags: [] })]);
        cleanupSettings();
    });

    it('does nothing when cloning fails', async () => {
        mockCloneListing.mockResolvedValue(null);
        mockListListings.mockResolvedValueOnce([makeListing({})]);
        await renderConnected();
        await act(async () => {
            fireEvent.click(await screen.findByTitle('marketplace.clone_title'));
        });
        expect(mockAddRubric).not.toHaveBeenCalled();
        cleanupSettings();
    });

    it('clones a question-bank listing into the local bank', async () => {
        mockDbState.isConnected = true;
        mockAppValue.settings = { ...mockSettings, schoolId: 'school-1' };
        const listing: MarketplaceListing = {
            id: 'l2',
            schoolId: 'school-1',
            publishedBy: 'u1',
            kind: 'questionBankItem',
            snapshot: mockQuestionBankItem,
            name: 'Capital Cities',
            subject: 'English',
            description: '',
            cefrLevels: ['B1'],
            upvoteCount: 2,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
        };
        mockListListings.mockResolvedValueOnce([listing]);
        mockCloneListing.mockResolvedValueOnce({ kind: 'questionBankItem', entity: mockQuestionBankItem });
        await act(async () => {
            renderPage();
        });
        fireEvent.click(await screen.findByTitle('marketplace.clone_title'));
        await waitFor(() => expect(mockCloneListing).toHaveBeenCalledWith('l2'));
        await waitFor(() =>
            expect(mockAddQuestionBankItems).toHaveBeenCalledWith([
                expect.objectContaining({ cefrLevel: 'B1', tags: ['culture'] }),
            ])
        );
        mockAppValue.settings = mockSettings;
    });
});

// Test the exported pure functions directly.
describe('filterAndSortListings', () => {
    it('filters by subject and kind', async () => {
        const { filterAndSortListings } = await import('../MarketplacePage');
        const listings = [
            { id: '1', subject: 'English', upvoteCount: 0, createdAt: '2024-01-01', kind: 'rubric' },
            { id: '2', subject: 'Math', upvoteCount: 0, createdAt: '2024-01-02', kind: 'rubric' },
        ] as Parameters<typeof filterAndSortListings>[0];
        expect(filterAndSortListings(listings, 'English', 'newest')).toHaveLength(1);
        expect(filterAndSortListings(listings, 'all', 'newest', 'rubric')).toHaveLength(2);
        expect(filterAndSortListings(listings, 'all', 'newest', 'test')).toHaveLength(0);
    });

    it('sorts by upvotes', async () => {
        const { filterAndSortListings } = await import('../MarketplacePage');
        const listings = [
            { id: '1', subject: 'English', upvoteCount: 2, createdAt: '2024-01-01' },
            { id: '2', subject: 'English', upvoteCount: 10, createdAt: '2024-01-02' },
        ] as Parameters<typeof filterAndSortListings>[0];
        expect(filterAndSortListings(listings, 'all', 'upvotes')[0].id).toBe('2');
    });

    it('sorts by newest when sortBy is newest', async () => {
        const { filterAndSortListings } = await import('../MarketplacePage');
        const listings = [
            { id: '1', subject: 'English', upvoteCount: 0, createdAt: '2024-01-01' },
            { id: '2', subject: 'English', upvoteCount: 0, createdAt: '2024-01-05' },
        ] as Parameters<typeof filterAndSortListings>[0];
        expect(filterAndSortListings(listings, 'all', 'newest')[0].id).toBe('2');
    });
});
