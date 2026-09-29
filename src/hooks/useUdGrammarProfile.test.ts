import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useUdGrammarProfile } from './useUdGrammarProfile';
import { parseConlluSentences } from '../utils/udParse';

const loadUdParser = vi.fn();
vi.mock('udpipe-wasm/udpipe.wasm?url', () => ({ default: 'udpipe.wasm' }));
vi.mock('../utils/udParse', async (orig) => ({
    ...(await orig<typeof import('../utils/udParse')>()),
    loadUdParser: (...args: unknown[]) => loadUdParser(...args),
}));

describe('useUdGrammarProfile', () => {
    it('reports unavailable when the model cannot be loaded', async () => {
        loadUdParser.mockRejectedValueOnce(new Error('UD model fetch failed (404)'));
        const { result } = renderHook(() => useUdGrammarProfile('She has finished.'));
        expect(result.current.status).toBe('loading');
        await waitFor(() => expect(result.current.status).toBe('unavailable'));
    });

    it('profiles the parsed sentences when the parser loads', async () => {
        const conllu = [
            '# text = I can swim.',
            '1\tI\tI\tPRON\tPRP\t_\t3\tnsubj\t_\t_',
            '2\tcan\tcan\tAUX\tMD\t_\t3\taux\t_\t_',
            '3\tswim\tswim\tVERB\tVB\t_\t0\troot\t_\tSpaceAfter=No',
            '4\t.\t.\tPUNCT\t.\t_\t3\tpunct\t_\t_',
            '',
        ].join('\n');
        loadUdParser.mockResolvedValueOnce({ parse: () => parseConlluSentences(conllu) });
        const { result } = renderHook(() => useUdGrammarProfile('I can swim.'));
        await waitFor(() => expect(result.current.status).toBe('ready'));
        if (result.current.status === 'ready') {
            expect(result.current.profile.results.A1.constructions.map((c) => c.id)).toContain('modal_can');
        }
        expect(loadUdParser).toHaveBeenLastCalledWith('models/english-ewt.udpipe', 'udpipe.wasm');
    });
});
