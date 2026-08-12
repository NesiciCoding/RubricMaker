import { RuleTester } from 'eslint';
import rule from './max-domains-in-render-hook.js';

const ruleTester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('max-domains-in-render-hook', rule, {
    valid: [
        "import { useRoster } from './AppContext'; renderHook(() => useRoster());",
        "import { useRoster, useAuthoring } from './AppContext'; renderHook(() => ({ ...useRoster(), ...useAuthoring() }));",
        "import { useRoster, useAuthoring, useSettings } from './AppContext'; renderHook(() => ({ ...useRoster(), ...useAuthoring(), ...useSettings() }));",
        "import { useRoster, useAuthoring, useSettings } from './AppContext'; renderHook(() => ({ ...useRoster(), ...useAuthoring(), ...useSettings() }), { wrapper });",
        "import { useRoster } from './AppContext'; const { result } = renderHook(() => { const { students } = useRoster(); return students.length; });",
        // Selector-store probes are the endorsed alternative — no domain hooks involved.
        'renderHook(() => useStoreSelector((s) => ({ students: s.students, rubrics: s.rubrics })));',
        'renderHook(() => useToast(), { wrapper });',
        'renderHook(() => useNotificationFeed());',
        // Calls that do not resolve to an AppContext import are not domain subscriptions.
        'renderHook(() => ({ ...useRoster(), ...useAuthoring(), ...useAssessment(), ...useSettings() }));',
        // A local function that merely shares a domain hook's name is not counted.
        "import { useAuthoring, useSettings } from './AppContext'; const useRoster = () => ({}); renderHook(() => ({ ...useRoster(), ...useAuthoring(), ...useSettings() }));",
    ],
    invalid: [
        {
            code: "import { useRoster, useAuthoring, useAssessment, useSettings } from './AppContext'; renderHook(() => ({ ...useRoster(), ...useAuthoring(), ...useAssessment(), ...useSettings() }));",
            errors: [{ messageId: 'tooManyDomains' }],
        },
        {
            code: "import { useRoster, useAuthoring, useEssays, useFlashcards } from './AppContext'; const { result } = renderHook(() => { const roster = useRoster(); const authoring = useAuthoring(); const essays = useEssays(); const flashcards = useFlashcards(); return { ...roster, ...authoring, ...essays, ...flashcards }; }, { wrapper });",
            errors: [{ messageId: 'tooManyDomains' }],
        },
        {
            code: "import { useRoster, useAuthoring, useSettings, usePlatform } from './AppContext'; renderHook(() => ({ ...useRoster(), ...useAuthoring(), ...useSettings(), ...usePlatform() }));",
            errors: [{ messageId: 'tooManyDomains' }],
        },
        // Aliased imports still count: the binding resolves to an AppContext domain hook.
        {
            code: "import { useRoster as useR, useAuthoring, useAssessment, useSettings } from './AppContext'; renderHook(() => ({ ...useR(), ...useAuthoring(), ...useAssessment(), ...useSettings() }));",
            errors: [{ messageId: 'tooManyDomains' }],
        },
    ],
});
