import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
    Plus,
    Save,
    ArrowLeft,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Trash2,
    FileText,
    BookMarked,
    Eye,
    Settings2,
    Timer,
    Calculator,
    Compass,
    ClipboardCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageTour from '../components/Tour/PageTour';
import { getTestBuilderTourSteps } from '../data/TutorialSteps';
import Topbar from '../components/Layout/Topbar';
import { useAssessment, useAuthoring, useFlashcards, useSettings } from '../context/AppContext';
import { htmlToPlainText } from '../hooks/useTTS';
import { useToast } from '../hooks/useToast';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { nanoid } from '../utils/nanoid';
import { toLocalDatetimeInput } from '../utils/dateInput';
import QuestionEditor from '../components/Tests/QuestionEditor';
import { type PrintTextFields } from '../components/Tests/TestA4Preview';
import TestInspector from '../components/Tests/TestInspector';
import TestSectionWorkspace from '../components/Tests/TestSectionWorkspace';
import QuestionBankModal from '../components/Tests/QuestionBankModal';
import TagFilterChips from '../components/Tests/TagFilterChips';
import { cloneBankItemIntoTest, duplicateQuestion, newQuestion } from '../utils/testQuestionClone';
import { testAssignBlockers } from '../utils/testQuestionIssues';
import type {
    Test,
    TestQuestion,
    TestQuestionType,
    TestSection,
    CefrLevel,
    CefrSkill,
    QuestionBankSkill,
    QuestionBankItem,
} from '../types';
import { CEFR_LEVELS, QUESTION_BANK_SKILLS, QUESTION_BANK_SKILL_LABELS } from '../data/cefrDescriptors';
import { sectionQuestions, isAutoScorable, hasRoutingCycle } from '../utils/placementRouting';
import { clamp } from '../utils/clamp';
import { plainQuestionPromptText } from '../utils/clozeParse';
import { EmptyState } from '../components/ui/EmptyState';
import QuestionTypePicker from '../components/Tests/QuestionTypePicker';
import TestOutlineRail from '../components/Tests/TestOutlineRail';
import QuestionSwitcher from '../components/Tests/QuestionSwitcher';
import ColumnResizer from '../components/Tests/ColumnResizer';
import TestSettingsDrawer, {
    type TestSettingsTab,
    type TestSettingsValues,
} from '../components/Tests/TestSettingsDrawer';
import TestChecksPanel, { type TestCheckRow, type VerifiedCheck } from '../components/Tests/TestChecksPanel';
import { questionTypeLabelKey } from '../utils/questionTypeKey';
import { SkeletonRow } from '../components/ui/Skeleton';
import { useSharedMaterials } from '../hooks/useSharedMaterials';
import type { SharedEntry } from '../utils/materialSharing';
import { cloneTestForCopy } from '../utils/testClone';
import SharedMaterialBanner from '../components/Sharing/SharedMaterialBanner';

/** Soft heuristic for a staircase level pool's builder warning — enough headroom for a couple of up/down moves without exhausting the pool. */
const MIN_QUESTIONS_PER_LEVEL = 3;

function clampThresholdPct(value: number): number {
    /* v8 ignore next 2 -- number inputs sanitise to '' so NaN is unreachable */
    if (!Number.isFinite(value)) return 0;
    return clamp(value, 0, 100);
}

export default function TestBuilderPage() {
    const { id } = useParams();
    const { t } = useTranslation();
    const { tests } = useAssessment();
    const found = !id || tests.some((tst) => tst.id === id);
    // A colleague's test is never in our own state; look it up among the shared ones instead.
    const shared = useSharedMaterials('test', !found);
    if (found) return <TestBuilderEditor />;
    const sharedEntry = shared.items.find((e) => e.item.id === id);
    if (sharedEntry) return <TestBuilderEditor key={sharedEntry.item.id} shared={sharedEntry} />;
    if (shared.connected && (shared.status === 'idle' || shared.status === 'loading')) {
        return (
            <>
                <Topbar title={t('tests.edit_test_title')} />
                <div className="page-content fade-in" aria-busy="true">
                    <SkeletonRow />
                    <SkeletonRow />
                </div>
            </>
        );
    }
    return <TestBuilderEditor />;
}

function TestBuilderEditor({ shared }: { shared?: SharedEntry<Test> }) {
    const navigate = useNavigate();
    const { id } = useParams();
    const location = useLocation();
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();
    const { gradeScales, addSectionBankItem, questionBank } = useAuthoring();
    const { tests, addTest, updateTest } = useAssessment();
    const { settings } = useSettings();
    const { addFlashcardDeck } = useFlashcards();

    const { save: saveSharedTest } = useSharedMaterials('test', false);
    const existing = shared ? shared.item : id ? tests.find((tst) => tst.id === id) : undefined;
    const readOnly = shared?.access === 'view';
    const notFound = !!id && !existing;
    const generatedState = !existing
        ? (location.state as {
              generated?: {
                  name?: string;
                  mode?: Test['mode'];
                  questions?: TestQuestion[];
                  sections?: TestSection[];
              };
              generatedShortfalls?: string[];
          })
        : undefined;
    const generated = generatedState?.generated;

    const [name, setName] = useState(existing?.name ?? generated?.name ?? '');
    const [nameError, setNameError] = useState('');
    const [durationError, setDurationError] = useState('');
    const [description, setDescription] = useState(existing?.description ?? '');
    const [questions, setQuestions] = useState<TestQuestion[]>(existing?.questions ?? generated?.questions ?? []);
    const [showBankModal, setShowBankModal] = useState(false);
    /** Section the question being created belongs to; null while the type picker is closed. */
    const [newQuestionFor, setNewQuestionFor] = useState<{ sectionId?: string } | null>(null);
    /** Question open in the focus pane. At rail widths this is the only editor on screen. */
    const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
    useEffect(() => {
        if (selectedQuestionId && questions.some((q) => q.id === selectedQuestionId)) return;
        setSelectedQuestionId(questions[0]?.id ?? null);
    }, [questions, selectedQuestionId]);
    const [sections, setSections] = useState<TestSection[]>(existing?.sections ?? generated?.sections ?? []);
    /** Section workspace open in the focus pane at rail widths; null means a question is showing. */
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
    const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null;
    const [collapsedQuestions, setCollapsedQuestions] = useState<Set<string>>(new Set());
    const [newSectionTitle, setNewSectionTitle] = useState('');
    const [durationMinutes, setDurationMinutes] = useState(
        existing?.durationMinutes ? String(existing.durationMinutes) : ''
    );
    const [dueDate, setDueDate] = useState(existing?.dueDate ? toLocalDatetimeInput(existing.dueDate) : '');
    const [shuffleQuestions, setShuffleQuestions] = useState(existing?.shuffleQuestions ?? false);
    const [requireSEB, setRequireSEB] = useState(existing?.requireSEB ?? false);
    const [autoConfirmScores, setAutoConfirmScores] = useState(existing?.autoConfirmScores !== false);
    const [normSettings, setNormSettings] = useState<Pick<Test, 'gradingNorm' | 'gradeDecimals' | 'passGrade'>>({
        gradingNorm: existing?.gradingNorm,
        gradeDecimals: existing?.gradeDecimals,
        passGrade: existing?.passGrade,
    });
    const [gradeScaleId, setGradeScaleId] = useState<string | undefined>(
        existing?.gradeScaleId ?? settings.defaultGradeScaleId
    );
    const [mode, setMode] = useState<NonNullable<Test['mode']>>(existing?.mode ?? generated?.mode ?? 'assessment');
    const [placementEngine, setPlacementEngine] = useState<NonNullable<Test['placementEngine']>>(
        existing?.placementEngine ?? 'mst'
    );
    const [generatorMinLevel, setGeneratorMinLevel] = useState<CefrLevel>(
        existing?.generatorConfig?.minCefrLevel ?? 'A1'
    );
    const [generatorMaxLevel, setGeneratorMaxLevel] = useState<CefrLevel>(
        existing?.generatorConfig?.maxCefrLevel ?? 'C2'
    );
    const [generatorSkills, setGeneratorSkills] = useState<QuestionBankSkill[]>(
        existing?.generatorConfig?.skills ?? []
    );
    const [generatorTags, setGeneratorTags] = useState<string[]>(existing?.generatorConfig?.tags ?? []);
    const [generatorMinQuestions, setGeneratorMinQuestions] = useState(existing?.generatorConfig?.minQuestions ?? 5);
    const [generatorMaxQuestions, setGeneratorMaxQuestions] = useState(existing?.generatorConfig?.maxQuestions ?? 12);
    const [generatorStarterBankItemId, setGeneratorStarterBankItemId] = useState<string | undefined>(
        existing?.generatorConfig?.starterBankItemId
    );
    const [showGeneratorStarterModal, setShowGeneratorStarterModal] = useState(false);
    const [allowMultipleAttempts, setAllowMultipleAttempts] = useState(existing?.allowMultipleAttempts ?? false);
    const [cefrTargetLevel, setCefrTargetLevel] = useState<CefrLevel | ''>(existing?.cefrTargetLevel ?? '');
    const [cefrSkill, setCefrSkill] = useState<CefrSkill | ''>(existing?.cefrSkill ?? '');
    const [contentArea, setContentArea] = useState<'listening' | 'reading' | 'grammar' | ''>(
        existing?.contentArea ?? ''
    );
    // BCP-47 base code; '' means the default (English). Written through on save (#956).
    const [contentLanguage, setContentLanguage] = useState<string>(existing?.contentLanguage ?? '');
    const [printText, setPrintText] = useState<PrintTextFields>({
        printHeader: existing?.printHeader,
        printIntro: existing?.printIntro,
        printFooter: existing?.printFooter,
    });
    /** Settings drawer: which tab is open, and whether it is open at all. */
    const [settingsTab, setSettingsTab] = useState<TestSettingsTab>('basics');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const openSettings = (tab: TestSettingsTab = 'basics') => {
        setSettingsTab(tab);
        setSettingsOpen(true);
    };
    /** The checks screen replaces the question pane until the teacher jumps back into a question. */
    const [checksOpen, setChecksOpen] = useState(false);
    const [showPreview, setShowPreview] = useState(() => window.innerWidth >= 1400);
    // The outline rail costs 248px of width, so it only appears where the editor still has room.
    const [isRailWide, setIsRailWide] = useState(() => window.innerWidth >= 1400);
    useEffect(() => {
        const onResize = () => {
            setIsRailWide(window.innerWidth >= 1400);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    // The narrow inspector is a sheet over the page; Escape dismisses it like the old slide-over.
    useEffect(() => {
        if (isRailWide || !showPreview) return;
        const sheet = () => document.querySelector<HTMLElement>('[data-testid="inspector-sheet"]');
        document.querySelector<HTMLElement>('[data-testid="inspector-sheet-close"]')?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setShowPreview(false);
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(
                sheet()?.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                ) ?? []
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            if (!sheet()?.contains(active)) {
                event.preventDefault();
                first.focus();
            } else if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.querySelector<HTMLElement>('[data-testid="a4-preview-toggle"]')?.focus();
        };
    }, [isRailWide, showPreview]);
    /**
     * Column widths and the one-pane "focus" mode for the wide layout. Session-only on purpose: the
     * project keeps UI preferences in settings, and a column width is not worth a stored setting.
     */
    const [railWidth, setRailWidth] = useState(240);
    const [inspectorWidth, setInspectorWidth] = useState(400);
    const [expandedPane, setExpandedPane] = useState<'rail' | 'inspector' | null>(null);
    const [tourRun, setTourRun] = useState(false);
    const testTourSteps = React.useMemo(() => getTestBuilderTourSteps(t), [t]);

    const [isDirty, setIsDirty] = useState(false);
    const mountedRef = useRef(false);
    // Counts edits so an async save can tell whether the form changed while it was in flight.
    const editCountRef = useRef(0);
    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            return;
        }
        editCountRef.current += 1;
        setIsDirty(true);
    }, [
        name,
        description,
        questions,
        sections,
        durationMinutes,
        dueDate,
        shuffleQuestions,
        requireSEB,
        autoConfirmScores,
        gradeScaleId,
        normSettings,
        mode,
        placementEngine,
        allowMultipleAttempts,
        cefrTargetLevel,
        cefrSkill,
        contentArea,
        printText,
        generatorMinLevel,
        generatorMaxLevel,
        generatorSkills,
        generatorTags,
        generatorMinQuestions,
        generatorMaxQuestions,
        generatorStarterBankItemId,
        contentLanguage,
    ]);
    const { dialogProps: unsavedDialogProps } = useUnsavedChangesGuard(isDirty && !readOnly);

    useEffect(() => {
        const shortfalls = generatedState?.generatedShortfalls;
        if (shortfalls?.length) showToast(shortfalls.join(' '), 'info');
        // Only ever relevant right after a generator navigation lands on this fresh page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const validSectionIds = React.useMemo(() => new Set(sections.map((s) => s.id)), [sections]);
    const routingCycleWarning = React.useMemo(
        () => mode === 'placement' && placementEngine === 'mst' && hasRoutingCycle({ sections }),
        [mode, placementEngine, sections]
    );
    // Builder-time advisory (mirrors the staircase engine's MIN_QUESTIONS_PER_LEVEL warning): for
    // each level in the configured range, how many bank questions would actually be pickable.
    const generatorLevelPoolWarnings = React.useMemo(() => {
        if (!(mode === 'placement' && placementEngine === 'generator')) return [];
        const minIdx = CEFR_LEVELS.indexOf(generatorMinLevel);
        const maxIdx = CEFR_LEVELS.indexOf(generatorMaxLevel);
        if (minIdx < 0 || maxIdx < 0 || minIdx > maxIdx) return [];
        const wantedTags = generatorTags.map((tag) => tag.toLowerCase());
        return CEFR_LEVELS.slice(minIdx, maxIdx + 1)
            .map((lvl) => {
                const matching = questionBank.filter(
                    (item) =>
                        item.cefrLevel === lvl &&
                        (generatorSkills.length === 0 ||
                            (item.cefrSkill && generatorSkills.includes(item.cefrSkill))) &&
                        (wantedTags.length === 0 || item.tags.some((tag) => wantedTags.includes(tag.toLowerCase())))
                );
                // Count actual pickable questions, not matching bank items — a 'section' bundle
                // contributes each of its own auto-scorable questions, not just one.
                const count = matching.reduce((sum, item) => {
                    if (item.kind === 'section') {
                        /* v8 ignore next 1 -- section payload is required (see cloneBankItemIntoTest) */
                        return sum + (item.section?.questions.filter(isAutoScorable).length ?? 0);
                    }
                    return sum + (item.question && isAutoScorable(item.question) ? 1 : 0);
                }, 0);
                return { level: lvl, count };
            })
            .filter((entry) => entry.count < MIN_QUESTIONS_PER_LEVEL);
    }, [mode, placementEngine, generatorMinLevel, generatorMaxLevel, generatorSkills, generatorTags, questionBank]);

    // Distinct tags across the whole bank, for the generator's tag-filter chips.
    const bankTags = React.useMemo(() => {
        const seen = new Map<string, string>();
        for (const item of questionBank) {
            for (const tag of item.tags) {
                const key = tag.toLowerCase();
                if (!seen.has(key)) seen.set(key, tag);
            }
        }
        return [...seen.values()].sort((a, b) => a.localeCompare(b));
    }, [questionBank]);

    // Derived (not separate state) so reopening a saved generator test shows the starter item's
    // real title immediately, instead of its raw id until the teacher re-picks it.
    const generatorStarterItem = React.useMemo(
        () => questionBank.find((item) => item.id === generatorStarterBankItemId),
        [questionBank, generatorStarterBankItemId]
    );
    const generatorStarterLabel = generatorStarterItem
        ? generatorStarterItem.kind === 'section'
            ? (generatorStarterItem.section?.title ?? '')
            : generatorStarterItem.question
              ? plainQuestionPromptText(generatorStarterItem.question)
              : ''
        : '';

    // Group questions by section for rendering; normalize stale sectionIds to null
    function questionsFor(sectionId: string | null): TestQuestion[] {
        return questions.filter((q) => {
            const normalized = q.sectionId && validSectionIds.has(q.sectionId) ? q.sectionId : null;
            return normalized === sectionId;
        });
    }

    // Reconstruct flat array from grouped order (uncategorised → section order)
    function flattenGroups(
        uncategorised: TestQuestion[],
        sectionGroups: Record<string, TestQuestion[]>
    ): TestQuestion[] {
        // v8 ignore next 1 -- sectionGroups has an entry for every section
        return [...uncategorised, ...sections.flatMap((s) => sectionGroups[s.id] ?? [])];
    }

    const displayOrderedQuestions = flattenGroups(
        questionsFor(null),
        Object.fromEntries(sections.map((s) => [s.id, questionsFor(s.id)]))
    );
    // Built from the unsaved draft so problems show before the first save; "no questions" only
    // matters once the test exists, otherwise a blank builder would open with a warning. Numbered in
    // display order (sections grouped), the same numbers the question cards show and saving uses.
    const draftBlockers = React.useMemo(() => {
        const blockers = testAssignBlockers({ questions: displayOrderedQuestions, mode, placementEngine });
        const noQuestions = blockers.noQuestions && !!existing;
        return noQuestions || blockers.entries.length > 0 ? { noQuestions, entries: blockers.entries } : null;
    }, [displayOrderedQuestions, mode, placementEngine, existing]);
    const issuesByQuestion = React.useMemo(
        () => new Map((draftBlockers?.entries ?? []).map((entry) => [entry.questionId, entry.issues])),
        [draftBlockers]
    );

    const previewTest: Test = {
        id: existing?.id ?? 'preview',
        name,
        description,
        questions: displayOrderedQuestions,
        sections: sections.length > 0 ? sections : undefined,
        durationMinutes: Number(durationMinutes) > 0 ? Number(durationMinutes) : undefined,
        requireSEB,
        shuffleQuestions,
        createdAt: existing?.createdAt ?? '',
        ...printText,
    };

    /**
     * Adding a question starts with its type. The picker from #1210 decides which answer control
     * the student gets, and the new question opens holding that type's first options/rows, so the
     * choice is applied rather than merely recorded.
     */
    function openTypePicker(sectionId?: string) {
        setNewQuestionFor({ sectionId });
    }

    function createQuestionOfType(type: TestQuestionType) {
        const sectionId = newQuestionFor?.sectionId;
        const question = newQuestion(sectionId, type);
        setNewQuestionFor(null);
        setQuestions((prev) => [...prev, question]);
        setSelectedSectionId(null);
        setSelectedQuestionId(question.id);
        // The new question is what the teacher wants to see, even from the checks screen.
        setChecksOpen(false);
    }

    /** Reorders inside the question's own part; moving between parts is a section change. */
    function moveQuestion(qid: string, delta: -1 | 1) {
        const question = questions.find((q) => q.id === qid);
        /* v8 ignore next -- the move buttons only render for a selected question */
        if (!question) return;
        const siblings = questionsFor(question.sectionId ?? null);
        const from = siblings.findIndex((q) => q.id === qid);
        const to = from + delta;
        if (to < 0 || to >= siblings.length) return;
        const target = siblings[to];
        setQuestions((prev) => {
            const next = [...prev];
            const a = next.findIndex((q) => q.id === qid);
            const b = next.findIndex((q) => q.id === target.id);
            [next[a], next[b]] = [next[b], next[a]];
            return next;
        });
    }

    function insertFromBank(item: QuestionBankItem) {
        const { questions: cloned, section } = cloneBankItemIntoTest(item);
        if (section) setSections((prev) => [...prev, section]);
        setQuestions((prev) => [...prev, ...cloned]);
        setShowBankModal(false);
    }

    function saveSectionToBank(section: TestSection) {
        const sectionQs = questionsFor(section.id).map(({ sectionId: _sectionId, ...q }) => q);
        addSectionBankItem(
            {
                title: section.title,
                content: section.content,
                audioUrl: section.audioUrl,
                maxPlays: section.maxPlays,
                spokenText: section.spokenText,
                transcript: section.transcript,
            },
            sectionQs,
            [],
            section.cefrLevel
        );
        showToast(t('questionBank.saved_toast'), 'success');
    }

    function seedDeckFromAboveLevelWords(section: TestSection, words: { word: string; level: CefrLevel }[]) {
        if (words.length === 0) return;
        const deck = addFlashcardDeck({
            name: t('tests.section_seed_deck_name', { section: section.title }),
            deckKind: 'vocabulary',
            cards: words.map((w) => ({ id: nanoid(), front: w.word, back: '', cefrLevel: w.level })),
        });
        showToast(t('vocabProfile.seed_deck_created', { name: deck.name, count: words.length }), 'success');
        navigate(`/flashcards/${deck.id}`);
    }

    function updateQuestion(qid: string, question: TestQuestion) {
        setQuestions((prev) => prev.map((q) => (q.id === qid ? question : q)));
    }

    function toggleQuestionCollapsed(qid: string) {
        setCollapsedQuestions((prev) => {
            const next = new Set(prev);
            if (!next.delete(qid)) next.add(qid);
            return next;
        });
    }

    /** Opens the question (and its section) and moves focus to it, from the issue list. */
    function jumpToQuestion(qid: string) {
        setChecksOpen(false);
        setSelectedSectionId(null);
        flushSync(() => {
            setSelectedQuestionId(qid);
            setCollapsedQuestions((prev) => {
                const next = new Set(prev);
                next.delete(qid);
                return next;
            });
        });
        const card = document.getElementById(`question-card-${qid}`);
        card?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        card?.focus({ preventScroll: true });
    }

    function copyQuestion(qid: string) {
        const index = questions.findIndex((q) => q.id === qid);
        /* v8 ignore next -- the duplicate button only renders for existing questions */
        if (index < 0) return;
        const copy = duplicateQuestion(questions[index]);
        setQuestions((prev) => [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]);
        setSelectedQuestionId(copy.id);
    }

    function removeQuestion(qid: string) {
        const index = questions.findIndex((q) => q.id === qid);
        /* v8 ignore next -- remove buttons only render for existing questions */
        if (index < 0) return;
        const removed = questions[index];
        if (selectedQuestionId === qid) {
            const neighbour = questions[index + 1] ?? questions[index - 1];
            setSelectedQuestionId(neighbour?.id ?? null);
        }
        setQuestions((prev) => prev.filter((q) => q.id !== qid));
        showToast(t('tests.question_removed', { number: index + 1 }), 'info', {
            action: {
                label: t('common.undo'),
                onClick: () =>
                    setQuestions((prev) => {
                        if (prev.some((q) => q.id === removed.id)) return prev;
                        const next = [...prev];
                        next.splice(Math.min(index, next.length), 0, removed);
                        return next;
                    }),
            },
        });
    }

    function addSection() {
        const title = newSectionTitle.trim();
        if (!title) return;
        setSections((prev) => [...prev, { id: nanoid(), title }]);
        setNewSectionTitle('');
    }

    function removeSection(sectionId: string) {
        if (sectionId === selectedSectionId) setSelectedSectionId(null);
        setSections((prev) =>
            prev
                .filter((s) => s.id !== sectionId)
                .map((s) => {
                    if (!s.routing) return s;
                    const { passSectionId, failSectionId } = s.routing;
                    if (passSectionId !== sectionId && failSectionId !== sectionId) return s;
                    return {
                        ...s,
                        routing: {
                            ...s.routing,
                            passSectionId: passSectionId === sectionId ? '' : passSectionId,
                            failSectionId: failSectionId === sectionId ? '' : failSectionId,
                        },
                    };
                })
        );
        setQuestions((prev) => prev.map((q) => (q.sectionId === sectionId ? { ...q, sectionId: undefined } : q)));
    }

    function renameSection(sectionId: string, title: string) {
        setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, title } : s)));
    }

    function updateSection(sectionId: string, patch: Partial<TestSection>) {
        setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
    }

    function updateSectionContent(sectionId: string, content: string) {
        updateSection(sectionId, { content });
    }

    function toggleSectionRouting(sectionId: string, enabled: boolean) {
        if (!enabled) {
            updateSection(sectionId, { routing: undefined });
            return;
        }
        const otherSectionId = sections.find((s) => s.id !== sectionId)?.id ?? '';
        updateSection(sectionId, {
            routing: { thresholdPct: 60, passSectionId: otherSectionId, failSectionId: otherSectionId },
        });
    }

    // The test as the form shows it now, shared by Save and by duplicating a colleague's test.
    function buildPayload(parsedDuration: number | undefined) {
        const sanitizedSections = sections.map((s) =>
            s.routing ? { ...s, routing: { ...s.routing, thresholdPct: clampThresholdPct(s.routing.thresholdPct) } } : s
        );

        return {
            name: name.trim(),
            description: description.trim() || undefined,
            questions: displayOrderedQuestions,
            sections: sanitizedSections.length > 0 ? sanitizedSections : undefined,
            durationMinutes: parsedDuration,
            dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
            shuffleQuestions,
            requireSEB,
            autoConfirmScores: autoConfirmScores ? undefined : false,
            gradeScaleId,
            ...(mode === 'placement' ? { gradingNorm: undefined } : normSettings),
            mode,
            placementEngine: mode === 'placement' ? placementEngine : undefined,
            generatorConfig:
                mode === 'placement' && placementEngine === 'generator'
                    ? {
                          minCefrLevel: generatorMinLevel,
                          maxCefrLevel: generatorMaxLevel,
                          skills: generatorSkills.length > 0 ? generatorSkills : undefined,
                          tags: generatorTags.length > 0 ? generatorTags : undefined,
                          minQuestions: generatorMinQuestions,
                          maxQuestions: generatorMaxQuestions,
                          starterBankItemId: generatorStarterBankItemId,
                      }
                    : undefined,
            allowMultipleAttempts: mode === 'practice' ? allowMultipleAttempts : undefined,
            cefrTargetLevel: cefrTargetLevel || undefined,
            cefrSkill: cefrSkill || undefined,
            contentArea: mode === 'practice' ? contentArea || undefined : undefined,
            contentLanguage: contentLanguage || undefined,
            printHeader: printText.printHeader,
            printIntro: printText.printIntro,
            printFooter: printText.printFooter,
        };
    }

    /**
     * Validates and persists, reporting whether anything was saved. A shared test saves asynchronously,
     * so its result is a promise; everything else resolves by the time handleSave returns.
     */
    function handleSave(): boolean | Promise<boolean> {
        /* v8 ignore next 1 -- the not-found view renders no save button */
        if (notFound) return false;
        if (!name.trim()) {
            setNameError(t('tests.name_required'));
            return false;
        }
        setNameError('');

        const trimmedDuration = durationMinutes.trim();
        const parsedDuration = trimmedDuration === '' ? undefined : Number(trimmedDuration);
        if (parsedDuration !== undefined && !(Number.isFinite(parsedDuration) && parsedDuration > 0)) {
            // The field lives in the drawer's Delivery tab: open it, or the error is invisible.
            openSettings('delivery');
            setDurationError(t('tests.duration_invalid'));
            return false;
        }
        setDurationError('');

        const payload = buildPayload(parsedDuration);

        // Incomplete questions don't block saving a draft, only assigning it (TestListPage).
        const blockers = testAssignBlockers(payload);
        const hasBlockers = blockers.noQuestions || blockers.entries.length > 0;
        const notifySaved = () =>
            hasBlockers
                ? showToast(t('tests.saved_with_issues', { count: blockers.entries.length || 1 }), 'warning')
                : showToast(t('tests.save_success'), 'success');

        if (shared) {
            /* v8 ignore next -- the Save button is disabled for a view-only share */
            if (readOnly) return false;
            const submittedAtEdit = editCountRef.current;
            return saveSharedTest({
                ...shared.item,
                ...payload,
                updatedAt: new Date().toISOString(),
            }).then((result) => {
                if (!result.success) {
                    showToast(t('sharing.save_failed'), 'error');
                    return false;
                }
                if (editCountRef.current === submittedAtEdit) setIsDirty(false);
                showToast(t('sharing.saved_to_owner', { name: shared.ownerName }), 'success');
                return true;
            });
        }
        if (existing) {
            updateTest({ ...existing, ...payload, updatedAt: new Date().toISOString() });
            notifySaved();
            flushSync(() => setIsDirty(false));
        } else {
            const created = addTest(payload);
            // Flush only after the create succeeds, and before navigate so
            // useBlocker doesn't see stale isDirty=true.
            flushSync(() => setIsDirty(false));
            notifySaved();
            navigate(`/tests/${created.id}`, { replace: true });
        }
        return true;
    }

    // Ctrl/Cmd+S saves from anywhere in the builder, inputs included, as in the Rubric Builder.
    // A view-only share has its Save button disabled, so the shortcut must not run validation or save either.
    const saveFromShortcut = () => {
        if (!readOnly) void handleSave();
    };
    const saveRef = useRef(saveFromShortcut);
    useEffect(() => {
        saveRef.current = saveFromShortcut;
    });
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveRef.current();
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const totalPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0);
    const allQuestionsCollapsed = questions.length > 0 && questions.every((q) => collapsedQuestions.has(q.id));
    const focusQuestion = questions.find((q) => q.id === selectedQuestionId) ?? null;

    const checkRows: TestCheckRow[] = (draftBlockers?.entries ?? []).map((entry) => {
        const question = displayOrderedQuestions.find((q) => q.id === entry.questionId);
        const label = question ? htmlToPlainText(plainQuestionPromptText(question)).trim() : '';
        return {
            questionId: entry.questionId,
            number: entry.number,
            label: label || (question ? t(questionTypeLabelKey(question.type)) : ''),
            issues: entry.issues,
        };
    });

    const verifiedChecks: VerifiedCheck[] = [];
    if (displayOrderedQuestions.length > 0 && checkRows.length === 0) {
        verifiedChecks.push({ id: 'answers', labelKey: 'tests.checks_ok_answers' });
    }
    if (totalPoints > 0) {
        verifiedChecks.push({ id: 'points', labelKey: 'tests.checks_ok_points', values: { points: totalPoints } });
    }
    if (
        mode === 'placement' &&
        placementEngine !== 'generator' &&
        sections.length > 0 &&
        !hasRoutingCycle({ sections })
    ) {
        verifiedChecks.push({ id: 'routing', labelKey: 'tests.checks_ok_routing' });
    }

    const checksPanel = (
        <TestChecksPanel
            rows={checkRows}
            noQuestions={!!draftBlockers?.noQuestions}
            questionCount={displayOrderedQuestions.length}
            totalPoints={totalPoints}
            verified={verifiedChecks}
            onJump={jumpToQuestion}
            onBack={() => setChecksOpen(false)}
            onSave={() => void handleSave()}
            onAssign={() => {
                const saved = handleSave();
                // Leave the draft only once it is actually saved: a failed name or duration check
                // keeps the teacher on the page that holds the error.
                if (saved === true) navigate('/tests');
                else if (saved instanceof Promise) {
                    void saved.then((ok) => {
                        if (ok) navigate('/tests');
                    });
                }
            }}
            readOnly={readOnly}
        />
    );

    const settingsValue: TestSettingsValues = {
        mode,
        placementEngine,
        contentArea,
        contentLanguage,
        durationMinutes,
        dueDate,
        shuffleQuestions,
        autoConfirmScores,
        requireSEB,
        allowMultipleAttempts,
        gradeScaleId,
        norm: normSettings,
        cefrTargetLevel,
        cefrSkill,
        printHeader: printText.printHeader,
        printIntro: printText.printIntro,
        printFooter: printText.printFooter,
    };

    const updateSettingsValue = (patch: Partial<TestSettingsValues>) => {
        if (patch.mode !== undefined) setMode(patch.mode);
        if (patch.placementEngine !== undefined) setPlacementEngine(patch.placementEngine);
        if (patch.contentArea !== undefined) setContentArea(patch.contentArea);
        if (patch.contentLanguage !== undefined) setContentLanguage(patch.contentLanguage);
        if (patch.durationMinutes !== undefined) {
            setDurationMinutes(patch.durationMinutes);
            if (durationError) setDurationError('');
        }
        if (patch.dueDate !== undefined) setDueDate(patch.dueDate);
        if (patch.shuffleQuestions !== undefined) setShuffleQuestions(patch.shuffleQuestions);
        if (patch.autoConfirmScores !== undefined) setAutoConfirmScores(patch.autoConfirmScores);
        if (patch.requireSEB !== undefined) setRequireSEB(patch.requireSEB);
        if (patch.allowMultipleAttempts !== undefined) setAllowMultipleAttempts(patch.allowMultipleAttempts);
        if ('gradeScaleId' in patch) setGradeScaleId(patch.gradeScaleId);
        if (patch.cefrTargetLevel !== undefined) setCefrTargetLevel(patch.cefrTargetLevel);
        if (patch.cefrSkill !== undefined) setCefrSkill(patch.cefrSkill);
        if ('printHeader' in patch || 'printIntro' in patch || 'printFooter' in patch) {
            setPrintText((prev) => ({
                printHeader: 'printHeader' in patch ? patch.printHeader : prev.printHeader,
                printIntro: 'printIntro' in patch ? patch.printIntro : prev.printIntro,
                printFooter: 'printFooter' in patch ? patch.printFooter : prev.printFooter,
            }));
        }
    };

    const updateSettingsNorm = (patch: Partial<TestSettingsValues['norm']>) =>
        setNormSettings((prev) => ({ ...prev, ...patch }));

    const settingsTiles: { tab: TestSettingsTab; labelKey: string; Icon: typeof Settings2; valueText: string }[] = [
        {
            tab: 'basics',
            labelKey: 'tests.settings_tile_mode',
            Icon: Settings2,
            valueText: t(`tests.mode_${mode}`),
        },
        {
            tab: 'delivery',
            labelKey: 'tests.settings_tile_delivery',
            Icon: Timer,
            valueText: durationMinutes
                ? t('tests.settings_summary_minutes', { minutes: durationMinutes })
                : t('tests.settings_summary_no_limit'),
        },
        {
            tab: 'scoring',
            labelKey: 'tests.settings_tile_scoring',
            Icon: Calculator,
            valueText: t('tests.settings_summary_points', { points: totalPoints }),
        },
        {
            tab: 'placement',
            labelKey: 'tests.settings_tile_placement',
            Icon: Compass,
            valueText: t(`tests.placement_engine_${placementEngine}`),
        },
        {
            tab: 'print',
            labelKey: 'tests.settings_tile_paper',
            Icon: FileText,
            valueText: printText.printHeader
                ? t('tests.settings_summary_paper_set')
                : t('tests.settings_summary_paper_empty'),
        },
    ];

    if (notFound) {
        return (
            <>
                <Topbar title={t('tests.edit_test_title')} />
                <div className="page-content fade-in">
                    <EmptyState icon={FileText} title={t('tests.not_found')}>
                        <button className="btn btn-secondary" onClick={() => navigate('/tests')}>
                            <ArrowLeft size={15} /> {t('tests.back_to_list')}
                        </button>
                    </EmptyState>
                </div>
            </>
        );
    }

    // The same element serves the rail column and the narrow slide-over, so the two cannot drift.
    const inspector = (
        <TestInspector
            test={previewTest}
            onPrintTextChange={(patch) => setPrintText((prev) => ({ ...prev, ...patch }))}
            question={selectedSection ? null : focusQuestion}
            questionNumber={
                focusQuestion && !selectedSection ? displayOrderedQuestions.indexOf(focusQuestion) + 1 : undefined
            }
            questionCount={questions.length}
            lang={contentLanguage || undefined}
            expanded={isRailWide ? expandedPane === 'inspector' : undefined}
            onToggleExpand={
                isRailWide ? () => setExpandedPane((pane) => (pane === 'inspector' ? null : 'inspector')) : undefined
            }
        />
    );

    return (
        <>
            <PageTour
                steps={testTourSteps}
                run={tourRun}
                onFinish={() => setTourRun(false)}
                onStartRequest={() => setTourRun(true)}
            />
            <Topbar
                title={existing ? t('tests.edit_test_title') : t('tests.new_test_title')}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={() => setTourRun(true)}>
                            {t('tutorial.tb_tour_button')}
                        </button>
                        {!isRailWide && (
                            <button
                                className={`btn btn-sm ${showPreview ? 'btn-primary' : 'btn-secondary'}`}
                                data-testid="a4-preview-toggle"
                                aria-pressed={showPreview}
                                onClick={() => setShowPreview((v) => !v)}
                            >
                                <Eye size={15} /> {t('tests.a4_preview_toggle')}
                            </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tests')}>
                            <ArrowLeft size={15} /> {t('tests.back_to_list')}
                        </button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => void handleSave()}
                            disabled={readOnly}
                            title={readOnly ? t('sharing.view_only') : undefined}
                        >
                            <Save size={15} /> {t('common.save')}
                        </button>
                    </>
                }
            />
            <div
                className="page-content fade-in"
                style={
                    // Only the rail layout has in-flow side columns; below 1400px the inspector is a
                    // sheet, so a grid would just reserve an empty track. The 10px tracks are the
                    // drag seams that resize the rail and the inspector, and a focused pane owns the
                    // whole grid.
                    isRailWide
                        ? {
                              display: 'grid',
                              gridTemplateColumns: expandedPane
                                  ? 'minmax(0, 1fr)'
                                  : `${railWidth}px 10px minmax(0, 1fr) 10px ${inspectorWidth}px`,
                              gap: expandedPane ? 20 : 6,
                              alignItems: 'start',
                          }
                        : undefined
                }
            >
                {isRailWide && expandedPane !== 'inspector' && (
                    <TestOutlineRail
                        sections={sections}
                        questions={displayOrderedQuestions}
                        totalPoints={totalPoints}
                        issuesByQuestion={issuesByQuestion}
                        activeId={selectedQuestionId}
                        activeSectionId={selectedSectionId}
                        onSelect={jumpToQuestion}
                        onSelectSection={(sectionId) => {
                            setChecksOpen(false);
                            setSelectedSectionId(sectionId);
                        }}
                        onAdd={() => openTypePicker()}
                        onOpenSettings={() => openSettings('basics')}
                        expanded={expandedPane === 'rail'}
                        onToggleExpand={() => setExpandedPane((pane) => (pane === 'rail' ? null : 'rail'))}
                    />
                )}
                {isRailWide && !expandedPane && (
                    <ColumnResizer
                        testId="rail-resizer"
                        label={t('tests.rail_resize')}
                        side="end"
                        value={railWidth}
                        min={180}
                        max={360}
                        defaultValue={240}
                        onChange={setRailWidth}
                    />
                )}
                <div
                    style={
                        // Focused on the outline or the paper, the editor keeps its state but leaves the page
                        // instead of sharing it with the focused pane.
                        expandedPane
                            ? { display: 'none' }
                            : isRailWide
                              ? { minWidth: 0, display: 'flex', flexDirection: 'column' }
                              : { minWidth: 0 }
                    }
                >
                    {shared && (
                        <SharedMaterialBanner
                            ownerName={shared.ownerName}
                            access={shared.access}
                            onDuplicate={() => {
                                // Copy what is on screen, edits included, not the stored original.
                                const duration = Number(durationMinutes.trim());
                                const draft = buildPayload(
                                    Number.isFinite(duration) && duration > 0 ? duration : undefined
                                );
                                const copy = addTest(
                                    cloneTestForCopy(
                                        { ...shared.item, ...draft },
                                        {
                                            name: `${(draft.name || shared.item.name).trim()} ${t('tests.copy_suffix')}`,
                                            folderId: undefined,
                                        }
                                    )
                                );
                                showToast(t('sharing.duplicated_toast', { name: copy.name }), 'success');
                                navigate(`/tests/${copy.id}`);
                            }}
                        />
                    )}
                    {draftBlockers && !checksOpen && (
                        <div
                            role="status"
                            data-testid="checks-strip"
                            className="card"
                            style={{
                                marginBottom: 20,
                                borderColor: 'var(--yellow)',
                                background: 'var(--bg-elevated)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                                // Above the open question: it is what stops the test being assigned.
                                order: isRailWide ? -2 : undefined,
                            }}
                        >
                            <AlertCircle size={15} style={{ color: 'var(--yellow-text)' }} aria-hidden="true" />
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('tests.issues_title')}</span>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                data-testid="checks_review"
                                onClick={() => setChecksOpen(true)}
                                style={{ marginLeft: 'auto' }}
                            >
                                {t('tests.checks_review')}
                            </button>
                        </div>
                    )}
                    <div
                        className="card"
                        data-tour="tb-details"
                        style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
                    >
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="test-name">{t('tests.name_label')}</label>
                            <input
                                id="test-name"
                                aria-invalid={nameError ? true : undefined}
                                aria-describedby={nameError ? 'test-name-error' : undefined}
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    if (nameError) setNameError('');
                                }}
                                placeholder={t('tests.name_placeholder')}
                            />
                            {nameError && (
                                <p
                                    id="test-name-error"
                                    style={{ color: 'var(--red-text)', fontSize: '0.8rem', marginTop: 4 }}
                                >
                                    <AlertCircle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                    {nameError}
                                </p>
                            )}
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="test-description">
                                {t('tests.description_label')}{' '}
                                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                                    ({t('essay_assignment.optional')})
                                </span>
                            </label>
                            <textarea
                                id="test-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                                placeholder={t('tests.description_placeholder')}
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                    </div>

                    {/* Settings entry points — the fields themselves live in the drawer. */}
                    <div className="card" data-tour="tb-settings" style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                            <h2 className="card-heading" style={{ margin: 0, fontSize: '0.95rem' }}>
                                {t('tests.settings_title')}
                            </h2>
                            <span className="text-muted text-xs">{t('tests.settings_strip_note')}</span>
                        </div>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                                gap: 8,
                            }}
                        >
                            {settingsTiles.map(({ tab, labelKey, Icon, valueText }) => (
                                <button
                                    key={tab}
                                    type="button"
                                    data-testid={`settings-tile-${tab}`}
                                    onClick={() => openSettings(tab)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '9px 10px',
                                        border: '1px solid var(--border)',
                                        borderRadius: 8,
                                        background: 'var(--bg-elevated)',
                                        color: 'var(--text)',
                                        font: 'inherit',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        minWidth: 0,
                                    }}
                                >
                                    <Icon size={15} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
                                    <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                                        <span className="text-xs" style={{ fontWeight: 600 }}>
                                            {t(labelKey)}
                                        </span>
                                        <span
                                            className="text-muted text-xs"
                                            style={{
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {valueText}
                                        </span>
                                    </span>
                                    <span
                                        className="text-xs"
                                        style={{ marginLeft: 'auto', color: 'var(--accent-text)', flexShrink: 0 }}
                                    >
                                        {t('tests.settings_edit')}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Generator config panel (roadmap 27.1) — replaces manual sections/routing for this
                    engine, since questions are pulled live from the bank rather than authored. */}
                    {mode === 'placement' && placementEngine === 'generator' && (
                        <div className="card" data-tour="tb-sections" style={{ marginBottom: 20 }}>
                            <h2 className="card-heading" style={{ marginTop: 0, marginBottom: 4, fontSize: '0.95rem' }}>
                                {t('tests.generator_config_title')}
                            </h2>
                            <p className="text-muted text-sm" style={{ marginTop: 0, marginBottom: 14 }}>
                                {t('tests.generator_config_hint')}
                            </p>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                                <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
                                    <label htmlFor="generator-min-level">{t('tests.generator_min_level_label')}</label>
                                    <select
                                        id="generator-min-level"
                                        value={generatorMinLevel}
                                        onChange={(e) => {
                                            const next = e.target.value as CefrLevel;
                                            setGeneratorMinLevel(next);
                                            setGeneratorMaxLevel((prev) =>
                                                CEFR_LEVELS.indexOf(prev) < CEFR_LEVELS.indexOf(next) ? next : prev
                                            );
                                        }}
                                    >
                                        {CEFR_LEVELS.map((lvl) => (
                                            <option key={lvl} value={lvl}>
                                                {lvl}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
                                    <label htmlFor="generator-max-level">{t('tests.generator_max_level_label')}</label>
                                    <select
                                        id="generator-max-level"
                                        value={generatorMaxLevel}
                                        onChange={(e) => {
                                            const next = e.target.value as CefrLevel;
                                            setGeneratorMaxLevel(next);
                                            setGeneratorMinLevel((prev) =>
                                                CEFR_LEVELS.indexOf(prev) > CEFR_LEVELS.indexOf(next) ? next : prev
                                            );
                                        }}
                                    >
                                        {CEFR_LEVELS.map((lvl) => (
                                            <option key={lvl} value={lvl}>
                                                {lvl}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
                                    <label htmlFor="generator-min-questions">
                                        {t('tests.generator_min_questions_label')}
                                    </label>
                                    <input
                                        id="generator-min-questions"
                                        type="number"
                                        min={1}
                                        value={generatorMinQuestions}
                                        onChange={(e) => {
                                            const next = Math.max(1, Number(e.target.value) || 1);
                                            setGeneratorMinQuestions(next);
                                            setGeneratorMaxQuestions((prev) => Math.max(prev, next));
                                        }}
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px' }}>
                                    <label htmlFor="generator-max-questions">
                                        {t('tests.generator_max_questions_label')}
                                    </label>
                                    <input
                                        id="generator-max-questions"
                                        type="number"
                                        min={generatorMinQuestions}
                                        value={generatorMaxQuestions}
                                        onChange={(e) =>
                                            setGeneratorMaxQuestions(
                                                Math.max(
                                                    generatorMinQuestions,
                                                    Number(e.target.value) || generatorMinQuestions
                                                )
                                            )
                                        }
                                    />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 14 }}>
                                <span className="text-xs" style={{ display: 'block', marginBottom: 6 }}>
                                    {t('tests.generator_skills_label')}
                                </span>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {QUESTION_BANK_SKILLS.map((skill) => (
                                        <label
                                            key={skill}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={generatorSkills.includes(skill)}
                                                onChange={(e) =>
                                                    setGeneratorSkills((prev) =>
                                                        e.target.checked
                                                            ? [...prev, skill]
                                                            : prev.filter((s) => s !== skill)
                                                    )
                                                }
                                            />
                                            {
                                                QUESTION_BANK_SKILL_LABELS[skill][
                                                    i18n.language.startsWith('nl') ? 'nl' : 'en'
                                                ]
                                            }
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 14 }}>
                                <span className="text-xs" style={{ display: 'block', marginBottom: 6 }}>
                                    {t('tests.generator_tags_label')}
                                </span>
                                {bankTags.length === 0 ? (
                                    <p className="text-muted text-sm" style={{ margin: 0 }}>
                                        {t('tests.generator_tags_none')}
                                    </p>
                                ) : (
                                    <TagFilterChips
                                        tags={bankTags}
                                        isSelected={(tag) =>
                                            generatorTags.some((g) => g.toLowerCase() === tag.toLowerCase())
                                        }
                                        onToggle={(tag) =>
                                            setGeneratorTags((prev) =>
                                                prev.some((g) => g.toLowerCase() === tag.toLowerCase())
                                                    ? prev.filter((g) => g.toLowerCase() !== tag.toLowerCase())
                                                    : [...prev, tag]
                                            )
                                        }
                                    />
                                )}
                            </div>
                            {generatorLevelPoolWarnings.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                                    {generatorLevelPoolWarnings.map(({ level, count }) => (
                                        <p
                                            key={level}
                                            style={{
                                                color: 'var(--yellow-text)',
                                                fontSize: '0.8125rem',
                                                margin: 0,
                                            }}
                                        >
                                            <AlertCircle
                                                size={13}
                                                style={{ verticalAlign: 'middle', marginRight: 4 }}
                                            />
                                            {t('tests.generator_pool_warning', { level, count })}
                                        </p>
                                    ))}
                                </div>
                            )}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <span className="text-xs" style={{ display: 'block', marginBottom: 6 }}>
                                    {t('tests.generator_starter_item_label')}
                                </span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span className="text-muted text-sm">
                                        {generatorStarterBankItemId
                                            ? generatorStarterLabel || generatorStarterBankItemId
                                            : t('tests.generator_starter_item_none')}
                                    </span>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setShowGeneratorStarterModal(true)}
                                    >
                                        <BookMarked size={14} /> {t('tests.generator_pick_starter_button')}
                                    </button>
                                    {generatorStarterBankItemId && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setGeneratorStarterBankItemId(undefined)}
                                        >
                                            {t('common.clear')}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {showGeneratorStarterModal && (
                                <QuestionBankModal
                                    onClose={() => setShowGeneratorStarterModal(false)}
                                    onSelect={(item) => {
                                        setGeneratorStarterBankItemId(item.id);
                                        setShowGeneratorStarterModal(false);
                                    }}
                                />
                            )}
                        </div>
                    )}

                    {/* Sections panel */}
                    {!(mode === 'placement' && placementEngine === 'generator') && (
                        <div className="card" data-tour="tb-sections" style={{ marginBottom: 20 }}>
                            <h2
                                className="card-heading"
                                style={{ marginTop: 0, marginBottom: 14, fontSize: '0.95rem' }}
                            >
                                {t('tests.sections_title')}
                            </h2>
                            {sections.length === 0 ? (
                                <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                                    {t('tests.sections_none_hint')}
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                                    {routingCycleWarning && (
                                        <p
                                            style={{
                                                color: 'var(--yellow-text)',
                                                fontSize: '0.8125rem',
                                                margin: 0,
                                            }}
                                        >
                                            <AlertCircle
                                                size={13}
                                                style={{ verticalAlign: 'middle', marginRight: 4 }}
                                            />
                                            {t('tests.section_routing_warning_cycle')}
                                        </p>
                                    )}
                                    {sections.map((s) => {
                                        const routingEnabled = !!s.routing;
                                        const autoScorableCount = sectionQuestions(
                                            { questions, sections },
                                            s.id
                                        ).filter(isAutoScorable).length;
                                        const sectionHasAutoScorable = autoScorableCount > 0;
                                        return (
                                            <div
                                                key={s.id}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 8,
                                                    padding: mode === 'placement' ? 10 : 0,
                                                    border: mode === 'placement' ? '1px solid var(--border)' : 'none',
                                                    borderRadius: mode === 'placement' ? 8 : 0,
                                                }}
                                            >
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <input
                                                        value={s.title}
                                                        onChange={(e) => renameSection(s.id, e.target.value)}
                                                        style={{ flex: 1, fontSize: '0.875rem' }}
                                                        aria-label={t('tests.section_name_label')}
                                                    />
                                                    <select
                                                        value={s.contentLanguage ?? ''}
                                                        onChange={(e) =>
                                                            updateSection(s.id, {
                                                                contentLanguage: e.target.value || undefined,
                                                            })
                                                        }
                                                        aria-label={t('tests.section_content_language_label')}
                                                        title={t('tests.section_content_language_label')}
                                                        style={{
                                                            fontSize: '0.78rem',
                                                            padding: '2px 4px',
                                                            maxWidth: 150,
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        <option value="">{t('tests.content_language_inherit')}</option>
                                                        <option value="en">{t('settings.language_en')}</option>
                                                        <option value="nl">{t('settings.language_nl')}</option>
                                                        <option value="fr">{t('settings.language_fr')}</option>
                                                        <option value="de">{t('settings.language_de')}</option>
                                                        <option value="es">{t('settings.language_es')}</option>
                                                    </select>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-icon btn-sm"
                                                        aria-label={t('tests.remove_section')}
                                                        style={{ color: 'var(--red-text)', flexShrink: 0 }}
                                                        onClick={() => removeSection(s.id)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>

                                                {mode === 'placement' && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        <div
                                                            className="form-group"
                                                            style={{ marginBottom: 0, maxWidth: 260 }}
                                                        >
                                                            <label
                                                                htmlFor={`section-cefr-${s.id}`}
                                                                className="text-muted text-xs"
                                                            >
                                                                {t('tests.section_cefr_level_label')}
                                                            </label>
                                                            <select
                                                                id={`section-cefr-${s.id}`}
                                                                value={s.cefrLevel ?? ''}
                                                                onChange={(e) =>
                                                                    updateSection(s.id, {
                                                                        cefrLevel:
                                                                            (e.target.value as CefrLevel | '') ||
                                                                            undefined,
                                                                    })
                                                                }
                                                            >
                                                                <option value="">
                                                                    {t('tests.section_cefr_level_none')}
                                                                </option>
                                                                {CEFR_LEVELS.map((lvl) => (
                                                                    <option key={lvl} value={lvl}>
                                                                        {lvl} – {t(`cefr.level_${lvl}`)}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {placementEngine === 'staircase' ? (
                                                            <p
                                                                className="text-muted text-xs"
                                                                style={{
                                                                    margin: 0,
                                                                    color:
                                                                        !s.cefrLevel ||
                                                                        autoScorableCount < MIN_QUESTIONS_PER_LEVEL
                                                                            ? 'var(--yellow)'
                                                                            : undefined,
                                                                }}
                                                            >
                                                                {(!s.cefrLevel ||
                                                                    autoScorableCount < MIN_QUESTIONS_PER_LEVEL) && (
                                                                    <AlertCircle
                                                                        size={12}
                                                                        style={{
                                                                            verticalAlign: 'middle',
                                                                            marginRight: 4,
                                                                        }}
                                                                    />
                                                                )}
                                                                {!s.cefrLevel
                                                                    ? t('tests.section_level_pool_untagged')
                                                                    : t('tests.section_level_pool_count', {
                                                                          count: autoScorableCount,
                                                                      })}
                                                            </p>
                                                        ) : (
                                                            <>
                                                                <label
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.8125rem',
                                                                    }}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={routingEnabled}
                                                                        onChange={(e) =>
                                                                            toggleSectionRouting(s.id, e.target.checked)
                                                                        }
                                                                        style={{ accentColor: 'var(--accent)' }}
                                                                    />
                                                                    {t('tests.section_routing_toggle')}
                                                                </label>

                                                                {routingEnabled && s.routing && (
                                                                    <div
                                                                        style={{
                                                                            display: 'flex',
                                                                            gap: 8,
                                                                            flexWrap: 'wrap',
                                                                            alignItems: 'flex-end',
                                                                        }}
                                                                    >
                                                                        <div
                                                                            className="form-group"
                                                                            style={{ marginBottom: 0, width: 120 }}
                                                                        >
                                                                            <label
                                                                                htmlFor={`routing-threshold-${s.id}`}
                                                                                className="text-muted text-xs"
                                                                            >
                                                                                {t(
                                                                                    'tests.section_routing_threshold_label'
                                                                                )}
                                                                            </label>
                                                                            <input
                                                                                id={`routing-threshold-${s.id}`}
                                                                                type="number"
                                                                                min={0}
                                                                                max={100}
                                                                                value={s.routing.thresholdPct}
                                                                                onChange={(e) =>
                                                                                    updateSection(s.id, {
                                                                                        routing: {
                                                                                            ...s.routing!,
                                                                                            thresholdPct:
                                                                                                clampThresholdPct(
                                                                                                    Number(
                                                                                                        e.target.value
                                                                                                    )
                                                                                                ),
                                                                                        },
                                                                                    })
                                                                                }
                                                                            />
                                                                        </div>
                                                                        <div
                                                                            className="form-group"
                                                                            style={{
                                                                                marginBottom: 0,
                                                                                flex: '1 1 160px',
                                                                            }}
                                                                        >
                                                                            <label
                                                                                htmlFor={`routing-pass-${s.id}`}
                                                                                className="text-muted text-xs"
                                                                            >
                                                                                {t('tests.section_routing_pass_label')}
                                                                            </label>
                                                                            <select
                                                                                id={`routing-pass-${s.id}`}
                                                                                value={s.routing.passSectionId}
                                                                                onChange={(e) =>
                                                                                    updateSection(s.id, {
                                                                                        routing: {
                                                                                            ...s.routing!,
                                                                                            passSectionId:
                                                                                                e.target.value,
                                                                                        },
                                                                                    })
                                                                                }
                                                                            >
                                                                                <option value="">
                                                                                    {t(
                                                                                        'tests.section_routing_end_test'
                                                                                    )}
                                                                                </option>
                                                                                {sections
                                                                                    .filter(
                                                                                        (other) => other.id !== s.id
                                                                                    )
                                                                                    .map((other) => (
                                                                                        <option
                                                                                            key={other.id}
                                                                                            value={other.id}
                                                                                        >
                                                                                            {other.title}
                                                                                        </option>
                                                                                    ))}
                                                                            </select>
                                                                        </div>
                                                                        <div
                                                                            className="form-group"
                                                                            style={{
                                                                                marginBottom: 0,
                                                                                flex: '1 1 160px',
                                                                            }}
                                                                        >
                                                                            <label
                                                                                htmlFor={`routing-fail-${s.id}`}
                                                                                className="text-muted text-xs"
                                                                            >
                                                                                {t('tests.section_routing_fail_label')}
                                                                            </label>
                                                                            <select
                                                                                id={`routing-fail-${s.id}`}
                                                                                value={s.routing.failSectionId}
                                                                                onChange={(e) =>
                                                                                    updateSection(s.id, {
                                                                                        routing: {
                                                                                            ...s.routing!,
                                                                                            failSectionId:
                                                                                                e.target.value,
                                                                                        },
                                                                                    })
                                                                                }
                                                                            >
                                                                                <option value="">
                                                                                    {t(
                                                                                        'tests.section_routing_end_test'
                                                                                    )}
                                                                                </option>
                                                                                {sections
                                                                                    .filter(
                                                                                        (other) => other.id !== s.id
                                                                                    )
                                                                                    .map((other) => (
                                                                                        <option
                                                                                            key={other.id}
                                                                                            value={other.id}
                                                                                        >
                                                                                            {other.title}
                                                                                        </option>
                                                                                    ))}
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {routingEnabled && !sectionHasAutoScorable && (
                                                                    <p
                                                                        style={{
                                                                            color: 'var(--yellow-text)',
                                                                            fontSize: '0.75rem',
                                                                            margin: 0,
                                                                        }}
                                                                    >
                                                                        <AlertCircle
                                                                            size={12}
                                                                            style={{
                                                                                verticalAlign: 'middle',
                                                                                marginRight: 4,
                                                                            }}
                                                                        />
                                                                        {t(
                                                                            'tests.section_routing_warning_no_autoscore'
                                                                        )}
                                                                    </p>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    value={newSectionTitle}
                                    onChange={(e) => setNewSectionTitle(e.target.value)}
                                    placeholder={t('tests.new_section_placeholder')}
                                    onKeyDown={(e) => e.key === 'Enter' && addSection()}
                                    style={{ flex: 1, fontSize: '0.875rem' }}
                                />
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={addSection}
                                    disabled={!newSectionTitle.trim()}
                                >
                                    <Plus size={14} /> {t('tests.add_section')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Questions */}
                    <div
                        data-tour="tb-add-question"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 14,
                            // With the rail open the question being edited is the point of the pane,
                            // so it moves above the test-wide setup cards.
                            order: isRailWide ? -1 : undefined,
                        }}
                    >
                        <h2 style={{ margin: 0, fontSize: '0.95rem' }}>
                            {t('tests.questions_title')}{' '}
                            <span className="text-muted text-sm">
                                {t('tests.questions_summary', {
                                    count: questions.length,
                                    points: t('tests.points_total', { count: totalPoints }),
                                })}
                            </span>
                        </h2>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {questions.length > 1 && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() =>
                                        setCollapsedQuestions(
                                            allQuestionsCollapsed ? new Set() : new Set(questions.map((q) => q.id))
                                        )
                                    }
                                >
                                    {allQuestionsCollapsed
                                        ? t('tests.expand_all_questions')
                                        : t('tests.collapse_all_questions')}
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                data-testid="checks_open"
                                aria-pressed={checksOpen}
                                onClick={() => setChecksOpen((open) => !open)}
                            >
                                <ClipboardCheck size={14} /> {t('tests.checks_title')}
                                {(draftBlockers?.entries.length ?? 0) > 0 && (
                                    <span
                                        className="text-xs"
                                        style={{
                                            minWidth: 16,
                                            padding: '0 4px',
                                            borderRadius: 999,
                                            background: 'var(--yellow)',
                                            color: 'var(--yellow-fg)',
                                            fontVariantNumeric: 'tabular-nums',
                                        }}
                                    >
                                        {draftBlockers?.entries.length}
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowBankModal(true)}
                            >
                                <Plus size={14} /> {t('questionBank.insert_button')}
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openTypePicker()}>
                                <Plus size={14} /> {t('tests.add_question')}
                            </button>
                        </div>
                    </div>

                    {!isRailWide && (questions.length > 0 || sections.length > 0) && (
                        <QuestionSwitcher
                            questions={displayOrderedQuestions}
                            sections={sections}
                            activeQuestionId={selectedQuestionId}
                            activeSectionId={selectedSectionId}
                            placeholderLabel={
                                selectedSectionId
                                    ? t('tests.switcher_section_open')
                                    : checksOpen
                                      ? t('tests.checks_title')
                                      : undefined
                            }
                            onSelectQuestion={jumpToQuestion}
                            onSelectSection={(sectionId) => {
                                setChecksOpen(false);
                                setSelectedSectionId(sectionId);
                            }}
                            onAdd={() => openTypePicker()}
                        />
                    )}

                    {checksOpen ? (
                        <div style={{ order: -1 }}>{checksPanel}</div>
                    ) : selectedSection ? (
                        <div style={{ order: -1, marginBottom: 20 }}>
                            <TestSectionWorkspace
                                key={selectedSection.id}
                                section={selectedSection}
                                targetLevel={(cefrTargetLevel || selectedSection.cefrLevel) as CefrLevel | ''}
                                questionCount={questionsFor(selectedSection.id).length}
                                onPatch={(patch) => updateSection(selectedSection.id, patch)}
                                onContentChange={(html) => updateSectionContent(selectedSection.id, html)}
                                onSaveToBank={() => saveSectionToBank(selectedSection)}
                                onSeedDeck={(words) => seedDeckFromAboveLevelWords(selectedSection, words)}
                                onAddQuestion={() => openTypePicker(selectedSection.id)}
                                onClose={() => setSelectedSectionId(null)}
                                defaultPassageOpen
                            />
                        </div>
                    ) : focusQuestion ? (
                        <div data-testid="question-focus" style={{ order: -1, marginBottom: 20 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    marginBottom: 10,
                                }}
                            >
                                <span className="text-muted text-sm">
                                    {t('tests.question_number', {
                                        number: displayOrderedQuestions.indexOf(focusQuestion) + 1,
                                    })}{' '}
                                    / {questions.length}
                                </span>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        aria-label={t('tests.move_question_up')}
                                        onClick={() => moveQuestion(focusQuestion.id, -1)}
                                    >
                                        <ChevronUp size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        aria-label={t('tests.move_question_down')}
                                        onClick={() => moveQuestion(focusQuestion.id, 1)}
                                    >
                                        <ChevronDown size={15} />
                                    </button>
                                </div>
                            </div>
                            <QuestionEditor
                                // The focus pane reuses one editor for every question; EssayEditor only
                                // reads `content` at mount, so without a key the previous question's
                                // prompt stays on screen after a switcher or rail jump.
                                key={focusQuestion.id}
                                question={focusQuestion}
                                index={displayOrderedQuestions.indexOf(focusQuestion)}
                                total={questions.length}
                                sections={sections}
                                onChange={(q) => updateQuestion(focusQuestion.id, q)}
                                onRemove={() => removeQuestion(focusQuestion.id)}
                                onDuplicate={() => copyQuestion(focusQuestion.id)}
                                collapsed={collapsedQuestions.has(focusQuestion.id)}
                                onToggleCollapsed={() => toggleQuestionCollapsed(focusQuestion.id)}
                                issues={issuesByQuestion.get(focusQuestion.id)}
                                showGrip={false}
                            />
                        </div>
                    ) : (
                        <div style={{ order: -1, marginBottom: 20 }}>
                            <EmptyState
                                title={t('tests.no_questions')}
                                description={t('tests.no_questions_instruction')}
                                action={{
                                    label: t('tests.add_question'),
                                    icon: Plus,
                                    onClick: () => openTypePicker(),
                                }}
                            />
                        </div>
                    )}
                </div>
                {isRailWide && !expandedPane && (
                    <ColumnResizer
                        testId="inspector-resizer"
                        label={t('tests.inspector_resize')}
                        side="start"
                        value={inspectorWidth}
                        min={320}
                        max={760}
                        defaultValue={400}
                        onChange={setInspectorWidth}
                    />
                )}
                {isRailWide
                    ? expandedPane !== 'rail' && (
                          <aside style={{ position: 'sticky', top: 12, minWidth: 0 }} data-testid="inspector-column">
                              {inspector}
                          </aside>
                      )
                    : showPreview && (
                          <section
                              data-testid="inspector-sheet"
                              role="region"
                              aria-label={t('tests.inspector_sheet_title')}
                              style={{
                                  position: 'fixed',
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  maxHeight: '85vh',
                                  zIndex: 60,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  overflow: 'hidden',
                                  background: 'var(--bg-elevated)',
                                  borderTop: '1px solid var(--border)',
                                  borderRadius: '14px 14px 0 0',
                                  boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.28)',
                              }}
                          >
                              <div
                                  style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '8px 12px',
                                      borderBottom: '1px solid var(--border)',
                                  }}
                              >
                                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                      {t('tests.inspector_sheet_title')}
                                  </span>
                                  <span
                                      aria-hidden="true"
                                      style={{
                                          width: 36,
                                          height: 4,
                                          borderRadius: 999,
                                          background: 'var(--border)',
                                          margin: '0 auto',
                                      }}
                                  />
                                  <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      data-testid="inspector-sheet-close"
                                      onClick={() => setShowPreview(false)}
                                  >
                                      {t('tests.inspector_sheet_close')}
                                  </button>
                              </div>
                              <div style={{ padding: 12, overflow: 'auto' }}>{inspector}</div>
                          </section>
                      )}
            </div>
            <TestSettingsDrawer
                open={settingsOpen}
                tab={settingsTab}
                onTabChange={setSettingsTab}
                onClose={() => setSettingsOpen(false)}
                value={settingsValue}
                onChange={updateSettingsValue}
                onNormChange={updateSettingsNorm}
                gradeScales={gradeScales}
                maxPoints={totalPoints}
                durationError={durationError}
                readOnly={readOnly}
            />
            {showBankModal && <QuestionBankModal onClose={() => setShowBankModal(false)} onSelect={insertFromBank} />}
            {newQuestionFor && (
                <QuestionTypePicker onSelect={createQuestionOfType} onClose={() => setNewQuestionFor(null)} />
            )}
            <ConfirmDialog {...unsavedDialogProps} />
        </>
    );
}
