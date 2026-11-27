import { describe, expect, it, vi } from 'vitest';
import { LiveWritingAdapter } from '../LiveWritingAdapter';
import type { LiveWritingSessionInput } from '../LiveWritingAdapter';

const input: LiveWritingSessionInput = {
    title: 'Friday quick-write',
    prompt: 'Write about the sea.',
    classId: 'class-1',
    minutesPerRound: 10,
    roundCount: 2,
    minWords: 40,
    maxWords: 120,
    scaffoldEnabled: true,
    scaffoldPrompts: [],
    liveLeaderboard: true,
    lockAfterStart: false,
    peerVoting: true,
    portalJoin: true,
};

const joinRow = {
    participant_id: 'participant-1',
    join_token: 'token-1',
    title: 'Friday quick-write',
    status: 'lobby',
    current_round: 1,
    round_count: 2,
    minutes_per_round: 10,
    min_words: 40,
    max_words: 120,
    scaffold_enabled: true,
};

describe('LiveWritingAdapter portal join', () => {
    it('persists portalJoin when creating a session', async () => {
        const single = vi.fn().mockResolvedValue({ data: { id: 's1', portal_join: true }, error: null });
        const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
        const adapter = new LiveWritingAdapter({ from: vi.fn(() => ({ insert })) } as never);

        const session = await adapter.createSession(input);

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ portal_join: true }));
        expect(session.portalJoin).toBe(true);
    });

    it('maps portalJoin on an existing session and its updates', async () => {
        const single = vi.fn().mockResolvedValue({ data: { id: 's1', portal_join: false }, error: null });
        const eq = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
        const update = vi.fn().mockReturnValue({ eq });
        const adapter = new LiveWritingAdapter({ from: vi.fn(() => ({ update })) } as never);

        const session = await adapter.updateSession('s1', { portalJoin: false });

        expect(update).toHaveBeenCalledWith({ portal_join: false });
        expect(session.portalJoin).toBe(false);
    });

    it('joins through the authenticated RPC and returns the participant token', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [joinRow], error: null });
        const adapter = new LiveWritingAdapter({ rpc } as never);

        const join = await adapter.joinViaPortal('RM-ABC123');

        expect(rpc).toHaveBeenCalledWith('join_live_writing_portal', { p_code: 'RM-ABC123' });
        expect(join).toEqual({
            participantId: 'participant-1',
            joinToken: 'token-1',
            title: 'Friday quick-write',
            status: 'lobby',
            currentRound: 1,
            roundCount: 2,
            minutesPerRound: 10,
            minWords: 40,
            maxWords: 120,
            scaffoldEnabled: true,
        });
    });

    it('surfaces the portal_join_disabled rejection', async () => {
        const rpc = vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'portal_join_disabled' },
        });
        const adapter = new LiveWritingAdapter({ rpc } as never);

        await expect(adapter.joinViaPortal('RM-ABC123')).rejects.toThrow('portal_join_disabled');
    });
});
