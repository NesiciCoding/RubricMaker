import { RuleTester } from 'eslint';
import rule from './max-domains-in-component.js';

const ruleTester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run('max-domains-in-component', rule, {
    valid: [
        // Function declarations: 0-3 domains OK.
        'function Dashboard() { const { students } = useRoster(); return null; }',
        'function Page() { const a = useRoster(); const b = useAuthoring(); const c = useSettings(); return null; }',
        // Arrow assigned to a capitalized const: 3 domains OK.
        'const GradeStudent = () => { const a = useRoster(); const b = useAuthoring(); const c = useSettings(); return null; };',
        // Selector-store consumers need no domain hooks at all.
        'function Dashboard() { const s = useStoreSelector((st) => ({ students: st.students })); return null; }',
        'function GradeStudent() { const { saveStudentRubric, updateSettings } = useStoreActions(); return null; }',
        // Domain hooks inside nested functions are a different hook boundary: Outer's 3
        // hooks must not absorb Inner's 3 (which would falsely total 6).
        'function Outer() { useRoster(); useAuthoring(); useAssessment(); function Inner() { useEssays(); useFlashcards(); useSettings(); return null; } return null; }',
        // Lowercase helpers / custom hooks are not components.
        'function useEverything() { useRoster(); useAuthoring(); useAssessment(); useEssays(); return 1; }',
        'const helper = () => { useRoster(); useAuthoring(); useAssessment(); useEssays(); };',
        // A memoized component with ≤3 domains is fine.
        'const Page = memo(() => { useRoster(); useAuthoring(); useSettings(); return null; });',
    ],
    invalid: [
        {
            code: 'function GradeStudent() { useRoster(); useAuthoring(); useAssessment(); useEssays(); return null; }',
            errors: [{ messageId: 'tooManyDomains' }],
        },
        {
            code: 'const StudentProfilePage = () => { const r = useRoster(); const a = useAuthoring(); const s = useAssessment(); const f = useFlashcards(); const st = useSettings(); return null; };',
            errors: [{ messageId: 'tooManyDomains' }],
        },
        {
            code: 'function Page() { const { students } = useRoster(); const { rubrics } = useAuthoring(); const { tests } = useAssessment(); const { decks } = useFlashcards(); const { settings } = useSettings(); const { essays } = useEssays(); return null; }',
            errors: [{ messageId: 'tooManyDomains' }],
        },
        // Memoized components are inspected like any other component.
        {
            code: 'const Page = memo(() => { useRoster(); useAuthoring(); useAssessment(); useEssays(); });',
            errors: [{ messageId: 'tooManyDomains' }],
        },
    ],
});
