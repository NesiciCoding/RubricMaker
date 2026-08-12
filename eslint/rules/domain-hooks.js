// Shared vocabulary for the domain-subscription lint rules. The seven domain hooks are
// the AppContext consumption surface (see src/context/domains); subscribing to more than
// MAX_DOMAINS of them in one unit (a renderHook callback or a component) defeats the
// domain-split render isolation, so such units should select exact slices via
// useStoreSelector / useStoreActions (src/context/useStore) instead.

export const DOMAIN_HOOKS = new Set([
    'useRoster',
    'useAuthoring',
    'useAssessment',
    'useEssays',
    'useFlashcards',
    'useSettings',
    'usePlatform',
]);

export const MAX_DOMAINS = 3;
