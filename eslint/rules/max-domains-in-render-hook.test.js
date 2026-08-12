import { RuleTester } from 'eslint';
import rule from './max-domains-in-render-hook.js';

const ruleTester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('max-domains-in-render-hook', rule, {
    valid: [
        'renderHook(() => useRoster());',
        'renderHook(() => ({ ...useRoster(), ...useAuthoring() }));',
        'renderHook(() => ({ ...useRoster(), ...useAuthoring(), ...useSettings() }));',
        'renderHook(() => ({ ...useRoster(), ...useAuthoring(), ...useSettings() }), { wrapper });',
        'const { result } = renderHook(() => { const { students } = useRoster(); return students.length; });',
        // Selector-store probes are the endorsed alternative — no domain hooks involved.
        'renderHook(() => useStoreSelector((s) => ({ students: s.students, rubrics: s.rubrics })));',
        'renderHook(() => useToast(), { wrapper });',
        'renderHook(() => useNotificationFeed());',
    ],
    invalid: [
        {
            code: 'renderHook(() => ({ ...useRoster(), ...useAuthoring(), ...useAssessment(), ...useSettings() }));',
            errors: [{ messageId: 'tooManyDomains' }],
        },
        {
            code: 'const { result } = renderHook(() => { const roster = useRoster(); const authoring = useAuthoring(); const essays = useEssays(); const flashcards = useFlashcards(); return { ...roster, ...authoring, ...essays, ...flashcards }; }, { wrapper });',
            errors: [{ messageId: 'tooManyDomains' }],
        },
        {
            code: 'renderHook(() => ({ ...useRoster(), ...useAuthoring(), ...useSettings(), ...usePlatform() }));',
            errors: [{ messageId: 'tooManyDomains' }],
        },
    ],
});
