import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { storageSync } from './StorageSync';
import { isAllowedSupabaseUrl } from './trustedSupabaseUrl';
import type {
    CefrLevel,
    LiveWritingJoin,
    LiveWritingParticipant,
    LiveWritingRosterEntry,
    LiveWritingRoundLogEntry,
    LiveWritingSelfRating,
    LiveWritingSession,
    LiveWritingSessionStatus,
    LiveWritingTimerSnapshot,
    LiveWritingTimerState,
    LiveWritingVoteChoice,
    LiveWritingVoteResult,
    LiveWritingVoteState,
} from '../../types';

export interface LiveWritingProgressRow {
    participantId: string;
    displayName: string;
    wordCount: number;
    /** Early vocabulary estimate only; never a grade and never aggregated. */
    cefrEstimate?: CefrLevel;
    handedInAt?: string;
}

export interface LiveWritingStudentState {
    sessionId: string;
    participantId: string;
    displayName: string;
    sessionTitle: string;
    status: LiveWritingSessionStatus;
    timerState: LiveWritingTimerState;
    endsAt?: string;
    remainingMs: number;
    serverNow: string;
    currentRound: number;
    roundCount: number;
    minutesPerRound: number;
    minWords: number;
    maxWords?: number;
    prompt: string;
    imagePath?: string;
    /** Resolved public bucket URL, when the teacher attached an image. */
    imageUrl?: string;
    scaffoldEnabled: boolean;
    /** Teacher-authored hints only, and only while the session switch is on. */
    scaffoldPrompts: string[];
    peerVoting: boolean;
    responseRound?: number;
    contentHtml: string;
    wordCount: number;
    /** Early vocabulary estimate; never a grade and never aggregated. */
    cefrEstimate?: CefrLevel;
    handedInAt?: string;
    selfRating?: LiveWritingSelfRating;
    selfNote?: string;
}

export interface LiveWritingSessionInput {
    title: string;
    prompt: string;
    /** Storage object path in the public `live-writing` bucket, never a full URL. */
    imagePath?: string;
    classId: string;
    minutesPerRound: number;
    roundCount: number;
    minWords: number;
    maxWords: number | null;
    scaffoldEnabled: boolean;
    scaffoldPrompts: string[];
    liveLeaderboard: boolean;
    lockAfterStart: boolean;
    peerVoting: boolean;
}

export type LiveWritingSessionPatch = Partial<LiveWritingSessionInput> & {
    status?: LiveWritingSessionStatus;
    currentRound?: number;
    votesOpen?: boolean;
};

type Row = Record<string, unknown>;

function asRows(data: unknown): Row[] {
    return Array.isArray(data) ? (data as Row[]) : [];
}

function firstRow(data: unknown): Row {
    return (asRows(data)[0] ?? {}) as Row;
}

function text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function optionalText(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
}

function number(value: unknown, fallback = 0): number {
    return typeof value === 'number' ? value : fallback;
}

function optionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function bool(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function mapSession(row: Row): LiveWritingSession {
    return {
        id: text(row.id),
        classId: text(row.class_id),
        title: text(row.title),
        prompt: text(row.prompt),
        imagePath: optionalText(row.image_path),
        status: text(row.status, 'draft') as LiveWritingSessionStatus,
        joinCode: text(row.join_code),
        joinCodeExpiresAt: optionalText(row.join_code_expires_at),
        roundCount: number(row.round_count, 1),
        currentRound: number(row.current_round, 1),
        minutesPerRound: number(row.minutes_per_round, 10),
        minWords: number(row.min_words),
        maxWords: optionalNumber(row.max_words),
        scaffoldEnabled: bool(row.scaffold_enabled, true),
        scaffoldPrompts: Array.isArray(row.scaffold_prompts)
            ? row.scaffold_prompts.filter((p): p is string => typeof p === 'string')
            : [],
        liveLeaderboard: bool(row.live_leaderboard, true),
        lockAfterStart: bool(row.lock_after_start),
        peerVoting: bool(row.peer_voting, true),
        votesOpen: bool(row.votes_open),
        timerState: text(row.timer_state, 'idle') as LiveWritingTimerState,
        timerEndsAt: optionalText(row.timer_ends_at),
        timerRemainingMs: number(row.timer_remaining_ms),
        showProgressBoard: bool(row.show_progress_board, true),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        startedAt: optionalText(row.started_at),
        endedAt: optionalText(row.ended_at),
    };
}

function mapTimer(row: Row): LiveWritingTimerSnapshot {
    return {
        status: text(row.status, 'lobby') as LiveWritingSessionStatus,
        timerState: text(row.timer_state, 'idle') as LiveWritingTimerState,
        endsAt: optionalText(row.timer_ends_at),
        remainingMs: number(row.timer_remaining_ms),
        serverNow: text(row.server_now),
        currentRound: number(row.current_round, 1),
        roundCount: number(row.round_count, 1),
        minutesPerRound: number(row.minutes_per_round, 10),
        showProgressBoard: bool(row.show_progress_board, true),
    };
}

function mapParticipant(row: Row): LiveWritingParticipant {
    return {
        id: text(row.id),
        sessionId: text(row.session_id),
        studentId: text(row.student_id),
        displayName: text(row.display_name),
        joinedAt: text(row.joined_at),
        lastSeenAt: text(row.last_seen_at),
    };
}

function mapStudentState(row: Row): LiveWritingStudentState {
    return {
        sessionId: text(row.session_id),
        participantId: text(row.participant_id),
        displayName: text(row.display_name, 'Student'),
        sessionTitle: text(row.session_title),
        status: text(row.session_status, 'lobby') as LiveWritingSessionStatus,
        timerState: text(row.timer_state, 'idle') as LiveWritingTimerState,
        endsAt: optionalText(row.timer_ends_at),
        remainingMs: number(row.timer_remaining_ms),
        serverNow: text(row.server_now),
        currentRound: number(row.current_round, 1),
        roundCount: number(row.round_count, 1),
        minutesPerRound: number(row.minutes_per_round, 10),
        minWords: number(row.min_words),
        maxWords: optionalNumber(row.max_words),
        prompt: text(row.prompt),
        imagePath: optionalText(row.image_path),
        scaffoldEnabled: bool(row.scaffold_enabled, false),
        scaffoldPrompts: Array.isArray(row.scaffold_prompts)
            ? row.scaffold_prompts.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
            : [],
        peerVoting: bool(row.peer_voting, true),
        responseRound: optionalNumber(row.response_round_index),
        contentHtml: text(row.content_html),
        wordCount: number(row.word_count),
        cefrEstimate: optionalText(row.cefr_estimate) as CefrLevel | undefined,
        handedInAt: optionalText(row.handed_in_at),
        selfRating: optionalText(row.self_rating) as LiveWritingSelfRating | undefined,
        selfNote: optionalText(row.self_note),
    };
}

function mapVoteState(row: Row): LiveWritingVoteState {
    return {
        status: text(row.session_status, 'lobby') as LiveWritingSessionStatus,
        currentRound: number(row.current_round, 1),
        roundCount: number(row.round_count, 1),
        peerVoting: bool(row.peer_voting, false),
        votesOpen: bool(row.votes_open),
        selfRating: optionalText(row.self_rating) as LiveWritingSelfRating | undefined,
        selfNote: optionalText(row.self_note),
        hasPair: bool(row.has_pair),
        voted: bool(row.voted),
        optionAHtml: optionalText(row.option_a_html),
        optionBHtml: optionalText(row.option_b_html),
        optionAWordCount: number(row.option_a_word_count),
        optionBWordCount: number(row.option_b_word_count),
    };
}

function mapVoteResult(row: Row): LiveWritingVoteResult {
    return {
        participantId: text(row.participant_id),
        displayName: text(row.display_name, 'Student'),
        selfRating: optionalText(row.self_rating) as LiveWritingSelfRating | undefined,
        selfNote: optionalText(row.self_note),
        votedForParticipantId: optionalText(row.voted_for_participant_id),
        votedForName: optionalText(row.voted_for_name),
        votesReceived: number(row.votes_received),
        hasPair: bool(row.has_pair),
    };
}

function mapRoundLog(row: Row): LiveWritingRoundLogEntry {
    return {
        id: text(row.log_id),
        roundIndex: number(row.round_index, 1),
        action: text(row.action) as LiveWritingRoundLogEntry['action'],
        detail: row.detail && typeof row.detail === 'object' ? (row.detail as Record<string, unknown>) : {},
        createdAt: text(row.created_at),
    };
}

function throwIfError(error: { message: string } | null): void {
    if (error) throw new Error(error.message);
}

/**
 * Database access for live writing sessions (#1159).
 *
 * Teachers use the signed-in adapter (RLS limits rows to the owner). Students use a throwaway
 * anon client and only ever call the SECURITY DEFINER RPCs — they have no table access at all.
 */
export class LiveWritingAdapter {
    constructor(private readonly client: SupabaseClient) {}

    static forTeacher(): LiveWritingAdapter | null {
        const client = storageSync.adapter.getClient();
        return client ? new LiveWritingAdapter(client) : null;
    }

    static forStudent(): LiveWritingAdapter | null {
        let saved: { supabaseUrl?: string; supabaseAnonKey?: string } = {};
        try {
            saved = JSON.parse(localStorage.getItem('rm_supabase_config') ?? '{}') as typeof saved;
        } catch {
            saved = {};
        }
        const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || saved.supabaseUrl;
        const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || saved.supabaseAnonKey;
        if (!url || !key || !isAllowedSupabaseUrl(url)) return null;
        return new LiveWritingAdapter(
            createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
        );
    }

    async listSessions(): Promise<LiveWritingSession[]> {
        const { data, error } = await this.client
            .from('live_writing_sessions')
            .select('*')
            .order('created_at', { ascending: false });
        throwIfError(error);
        return asRows(data).map(mapSession);
    }

    async getSession(sessionId: string): Promise<LiveWritingSession> {
        const { data, error } = await this.client
            .from('live_writing_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();
        throwIfError(error);
        return mapSession(data as Row);
    }

    async createSession(input: LiveWritingSessionInput): Promise<LiveWritingSession> {
        const { data, error } = await this.client
            .from('live_writing_sessions')
            .insert({
                title: input.title,
                prompt: input.prompt,
                image_path: input.imagePath?.trim() ? input.imagePath.trim() : null,
                class_id: input.classId,
                minutes_per_round: input.minutesPerRound,
                round_count: input.roundCount,
                min_words: input.minWords,
                max_words: input.maxWords,
                scaffold_enabled: input.scaffoldEnabled,
                scaffold_prompts: input.scaffoldPrompts.slice(0, 3),
                live_leaderboard: input.liveLeaderboard,
                lock_after_start: input.lockAfterStart,
                peer_voting: input.peerVoting,
            })
            .select('*')
            .single();
        throwIfError(error);
        return mapSession(data as Row);
    }

    async updateSession(sessionId: string, patch: LiveWritingSessionPatch): Promise<LiveWritingSession> {
        const row: Row = {};
        if (patch.title !== undefined) row.title = patch.title;
        if (patch.prompt !== undefined) row.prompt = patch.prompt;
        if (patch.imagePath !== undefined)
            row.image_path = patch.imagePath.trim() === '' ? null : patch.imagePath.trim();
        if (patch.classId !== undefined) row.class_id = patch.classId;
        if (patch.minutesPerRound !== undefined) row.minutes_per_round = patch.minutesPerRound;
        if (patch.roundCount !== undefined) row.round_count = patch.roundCount;
        if (patch.minWords !== undefined) row.min_words = patch.minWords;
        if (patch.maxWords !== undefined) row.max_words = patch.maxWords;
        if (patch.scaffoldEnabled !== undefined) row.scaffold_enabled = patch.scaffoldEnabled;
        if (patch.scaffoldPrompts !== undefined) row.scaffold_prompts = patch.scaffoldPrompts.slice(0, 3);
        if (patch.liveLeaderboard !== undefined) row.live_leaderboard = patch.liveLeaderboard;
        if (patch.lockAfterStart !== undefined) row.lock_after_start = patch.lockAfterStart;
        if (patch.peerVoting !== undefined) row.peer_voting = patch.peerVoting;
        if (patch.status !== undefined) row.status = patch.status;
        if (patch.currentRound !== undefined) row.current_round = patch.currentRound;
        if (patch.votesOpen !== undefined) row.votes_open = patch.votesOpen;

        const { data, error } = await this.client
            .from('live_writing_sessions')
            .update(row)
            .eq('id', sessionId)
            .select('*')
            .single();
        throwIfError(error);
        return mapSession(data as Row);
    }

    /**
     * Uploads a prompt image to the public `live-writing` bucket. The first path segment must be
     * the uploader's uid: that is what the bucket's storage policies check.
     */
    async uploadPromptImage(file: File): Promise<string> {
        const { data, error } = await this.client.auth.getUser();
        throwIfError(error);
        if (!data.user) throw new Error('not_authenticated');
        const extension = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const path = `${data.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await this.client.storage.from('live-writing').upload(path, file, {
            contentType: file.type || 'image/png',
            upsert: false,
        });
        throwIfError(uploadError);
        return path;
    }

    /** Public URL for a prompt image object path. Full URLs are returned unchanged. */
    promptImageUrl(path: string): string {
        return /^https?:\/\//i.test(path)
            ? path
            : this.client.storage.from('live-writing').getPublicUrl(path).data.publicUrl;
    }

    /** Best-effort cleanup of a replaced image; the session row is the source of truth. */
    async removePromptImage(path: string): Promise<void> {
        if (!path || /^https?:\/\//i.test(path)) return;
        await this.client.storage.from('live-writing').remove([path]);
    }

    async listParticipants(sessionId: string): Promise<LiveWritingParticipant[]> {
        const { data, error } = await this.client
            .from('live_writing_participants')
            .select('*')
            .eq('session_id', sessionId)
            .order('joined_at', { ascending: true });
        throwIfError(error);
        return asRows(data).map(mapParticipant);
    }

    async roster(code: string): Promise<LiveWritingRosterEntry[]> {
        const { data, error } = await this.client.rpc('live_writing_roster', { p_code: code });
        throwIfError(error);
        return asRows(data).map((row) => ({
            studentId: text(row.student_id),
            name: text(row.name, 'Student'),
        }));
    }

    async join(code: string, studentId: string): Promise<LiveWritingJoin> {
        const { data, error } = await this.client.rpc('join_live_writing_session', {
            p_code: code,
            p_student_id: studentId,
        });
        throwIfError(error);
        const row = firstRow(data);
        return {
            participantId: text(row.participant_id),
            joinToken: text(row.join_token),
            title: text(row.title),
            status: text(row.status, 'lobby') as LiveWritingSessionStatus,
            currentRound: number(row.current_round, 1),
            roundCount: number(row.round_count, 1),
            minutesPerRound: number(row.minutes_per_round, 10),
            minWords: number(row.min_words),
            maxWords: optionalNumber(row.max_words),
            scaffoldEnabled: bool(row.scaffold_enabled, true),
        };
    }

    async getStudentState(participantId: string, token: string): Promise<LiveWritingStudentState> {
        const { data, error } = await this.client.rpc('get_live_writing_student_state', {
            p_participant_id: participantId,
            p_token: token,
        });
        throwIfError(error);
        const state = mapStudentState(firstRow(data));
        if (state.imagePath) {
            state.imageUrl = /^https?:\/\//i.test(state.imagePath)
                ? state.imagePath
                : this.client.storage.from('live-writing').getPublicUrl(state.imagePath).data.publicUrl;
        }
        return state;
    }

    async saveText(
        participantId: string,
        token: string,
        roundIndex: number,
        contentHtml: string,
        cefrEstimate: CefrLevel | null = null
    ): Promise<{ wordCount: number; savedAt: string }> {
        const { data, error } = await this.client.rpc('save_live_writing_text', {
            p_participant_id: participantId,
            p_token: token,
            p_round_index: roundIndex,
            p_content_html: contentHtml,
            p_cefr_estimate: cefrEstimate,
        });
        throwIfError(error);
        const row = firstRow(data);
        return { wordCount: number(row.word_count), savedAt: text(row.saved_at) };
    }

    async handIn(
        participantId: string,
        token: string,
        roundIndex: number,
        contentHtml: string | null = null,
        cefrEstimate: CefrLevel | null = null
    ): Promise<string> {
        const { data, error } = await this.client.rpc('hand_in_live_writing', {
            p_participant_id: participantId,
            p_token: token,
            p_round_index: roundIndex,
            p_content_html: contentHtml,
            p_cefr_estimate: cefrEstimate,
        });
        throwIfError(error);
        return text(firstRow(data).handed_in_at);
    }

    async selfCheck(
        participantId: string,
        token: string,
        roundIndex: number,
        rating: LiveWritingSelfRating,
        note: string
    ): Promise<{ rating: LiveWritingSelfRating; note?: string }> {
        const { data, error } = await this.client.rpc('self_check_live_writing', {
            p_participant_id: participantId,
            p_token: token,
            p_round_index: roundIndex,
            p_rating: rating,
            p_note: note,
        });
        throwIfError(error);
        const row = firstRow(data);
        return {
            rating: text(row.self_rating, rating) as LiveWritingSelfRating,
            note: optionalText(row.self_note),
        };
    }

    async getVoteState(participantId: string, token: string): Promise<LiveWritingVoteState> {
        const { data, error } = await this.client.rpc('get_live_writing_vote_state', {
            p_participant_id: participantId,
            p_token: token,
        });
        throwIfError(error);
        return mapVoteState(firstRow(data));
    }

    async vote(participantId: string, token: string, roundIndex: number, choice: LiveWritingVoteChoice): Promise<void> {
        const { error } = await this.client.rpc('submit_live_writing_vote', {
            p_participant_id: participantId,
            p_token: token,
            p_round_index: roundIndex,
            p_choice: choice,
        });
        throwIfError(error);
    }

    async getVoteResults(sessionId: string, roundIndex: number): Promise<LiveWritingVoteResult[]> {
        const { data, error } = await this.client.rpc('get_live_writing_vote_results', {
            p_session_id: sessionId,
            p_round_index: roundIndex,
        });
        throwIfError(error);
        return asRows(data).map(mapVoteResult);
    }

    async getRoundLog(sessionId: string, roundIndex: number): Promise<LiveWritingRoundLogEntry[]> {
        const { data, error } = await this.client.rpc('get_live_writing_round_log', {
            p_session_id: sessionId,
            p_round_index: roundIndex,
        });
        throwIfError(error);
        return asRows(data).map(mapRoundLog);
    }

    async setVoting(sessionId: string, roundIndex: number, open: boolean): Promise<void> {
        const { error } = await this.client.rpc('set_live_writing_voting', {
            p_session_id: sessionId,
            p_round_index: roundIndex,
            p_open: open,
        });
        throwIfError(error);
    }

    async startWriting(sessionId: string): Promise<LiveWritingTimerSnapshot> {
        const { data, error } = await this.client.rpc('start_live_writing_session', {
            p_session_id: sessionId,
        });
        throwIfError(error);
        return mapTimer(firstRow(data));
    }

    async startRound(sessionId: string, roundIndex: number): Promise<LiveWritingTimerSnapshot> {
        const { data, error } = await this.client.rpc('start_live_writing_round', {
            p_session_id: sessionId,
            p_round_index: roundIndex,
        });
        throwIfError(error);
        return mapTimer(firstRow(data));
    }

    async controlTimer(
        sessionId: string,
        action: 'pause' | 'resume' | 'extend' | 'end_writing' | 'end_session'
    ): Promise<LiveWritingTimerSnapshot> {
        const { data, error } = await this.client.rpc('control_live_writing_timer', {
            p_session_id: sessionId,
            p_action: action,
        });
        throwIfError(error);
        return mapTimer(firstRow(data));
    }

    async getTimer(sessionId: string): Promise<LiveWritingTimerSnapshot> {
        const { data, error } = await this.client.rpc('get_live_writing_timer', {
            p_session_id: sessionId,
        });
        throwIfError(error);
        return mapTimer(firstRow(data));
    }

    async setProgressBoard(sessionId: string, show: boolean): Promise<boolean> {
        const { data, error } = await this.client.rpc('set_live_writing_progress_board', {
            p_session_id: sessionId,
            p_show: show,
        });
        throwIfError(error);
        return data === true;
    }

    /**
     * Word counts only. `content_html` is deliberately never selected: the projector must not be
     * able to show participant text before the finals view is built.
     */
    async fetchProgress(sessionId: string, roundIndex: number): Promise<LiveWritingProgressRow[]> {
        const [participantsResult, responsesResult] = await Promise.all([
            this.client
                .from('live_writing_participants')
                .select('id, display_name')
                .eq('session_id', sessionId)
                .order('joined_at', { ascending: true }),
            this.client
                .from('live_writing_responses')
                .select('participant_id, word_count, cefr_estimate, handed_in_at')
                .eq('session_id', sessionId)
                .eq('round_index', roundIndex),
        ]);
        throwIfError(participantsResult.error);
        throwIfError(responsesResult.error);

        const responses = new Map(asRows(responsesResult.data).map((row) => [text(row.participant_id), row] as const));
        return asRows(participantsResult.data)
            .map((row) => {
                const response = responses.get(text(row.id));
                return {
                    participantId: text(row.id),
                    displayName: text(row.display_name, 'Student'),
                    wordCount: number(response?.word_count),
                    cefrEstimate: optionalText(response?.cefr_estimate) as CefrLevel | undefined,
                    handedInAt: optionalText(response?.handed_in_at),
                };
            })
            .sort((a, b) => b.wordCount - a.wordCount || a.displayName.localeCompare(b.displayName));
    }

    /** Fire-and-forget hint for other screens; polling remains the correctness path. */
    async broadcastSessionEvent(sessionId: string, kind: 'timer' | 'progress' | 'roster'): Promise<void> {
        const channel = this.client.channel(`live-writing:${sessionId}`);
        try {
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(resolve, 1200);
                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            });
            await channel.send({
                type: 'broadcast',
                event: 'session',
                payload: { kind, at: new Date().toISOString() },
            });
        } catch {
            // Realtime is a hint only; the database write and polling remain authoritative.
        } finally {
            void this.client.removeChannel(channel);
        }
    }

    subscribeToSession(sessionId: string, onChange: () => void): () => void {
        const channel = this.client
            .channel(`live-writing:${sessionId}`)
            .on('broadcast', { event: 'session' }, () => onChange())
            .subscribe();
        return () => {
            void this.client.removeChannel(channel);
        };
    }
}
