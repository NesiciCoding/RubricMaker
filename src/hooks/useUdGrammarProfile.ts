import { useEffect, useState } from 'react';
import type { GrammarProfileResult } from '../utils/grammarProfile';

export const UD_MODEL_URL = 'models/english-ewt.udpipe';

export type UdGrammarState =
    { status: 'loading' } | { status: 'ready'; profile: GrammarProfileResult } | { status: 'unavailable' };

/**
 * Profiles grammar with the UD dependency parser when the (separately hosted) model file is
 * reachable; otherwise reports `unavailable` so callers keep the compromise-based profile.
 */
export function useUdGrammarProfile(text: string | null): UdGrammarState {
    const [state, setState] = useState<UdGrammarState>({ status: 'loading' });

    useEffect(() => {
        if (!text) return;
        let cancelled = false;
        setState({ status: 'loading' });
        (async () => {
            try {
                const [{ loadUdParser }, { profileUdSentences }, wasm] = await Promise.all([
                    import('../utils/udParse'),
                    import('../utils/grammarProfile'),
                    import('udpipe-wasm/udpipe.wasm?url'),
                ]);
                const parser = await loadUdParser(UD_MODEL_URL, wasm.default);
                const profile = profileUdSentences(parser.parse(text));
                if (!cancelled) setState({ status: 'ready', profile });
            } catch {
                if (!cancelled) setState({ status: 'unavailable' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [text]);

    return state;
}
