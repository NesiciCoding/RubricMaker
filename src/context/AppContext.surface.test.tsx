import { describe, expect, it } from 'vitest';
import * as AppContextModule from './AppContext';

// useApp() — the merged view that spread every domain context into one value — was removed
// because a single dispatch then re-rendered every consumer, silently defeating the
// domain-split isolation. The supported consumption paths are the seven domain hooks
// (useRoster, useAuthoring, ...) and the selector store (useStoreSelector). These
// assertions make the removal a hard contract: the runtime check catches an accidental
// re-export, and the type system already rejects any `import { useApp }` attempt.
describe('AppContext module surface', () => {
    it('does not export the merged useApp hook', () => {
        expect(AppContextModule).not.toHaveProperty('useApp');
    });

    it('still exposes the seven domain hooks', () => {
        for (const hook of [
            'useRoster',
            'useAuthoring',
            'useAssessment',
            'useEssays',
            'useFlashcards',
            'useSettings',
            'usePlatform',
        ]) {
            expect(AppContextModule).toHaveProperty(hook);
        }
    });
});
