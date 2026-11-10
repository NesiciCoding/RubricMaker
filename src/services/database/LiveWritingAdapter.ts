import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { storageSync } from './StorageSync';
import { isAllowedSupabaseUrl } from './trustedSupabaseUrl';
import type {
    LiveWritingJoin,
    LiveWritingParticipant,
    LiveWritingRosterEntry,
    LiveWritingSession,
    LiveWritingSessionStatus,
} from '../../types';

export interface LiveWritingSessionInput {
    title: string;
    prompt: string;
    classId: string;
    minutesPerRound: number;
    roundCount: number;
    minWords: number;
    maxWords: number | null;
    scaffoldEnabled: boolean;
    liveLeaderboard: boolean;
    lockAfterStart: boolean;
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
        votesOpen: bool(row.votes_open),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        startedAt: optionalText(row.started_at),
        endedAt: optionalText(row.ended_at),
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
                class_id: input.classId,
                minutes_per_round: input.minutesPerRound,
                round_count: input.roundCount,
                min_words: input.minWords,
                max_words: input.maxWords,
                scaffold_enabled: input.scaffoldEnabled,
                live_leaderboard: input.liveLeaderboard,
                lock_after_start: input.lockAfterStart,
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
        if (patch.classId !== undefined) row.class_id = patch.classId;
        if (patch.minutesPerRound !== undefined) row.minutes_per_round = patch.minutesPerRound;
        if (patch.roundCount !== undefined) row.round_count = patch.roundCount;
        if (patch.minWords !== undefined) row.min_words = patch.minWords;
        if (patch.maxWords !== undefined) row.max_words = patch.maxWords;
        if (patch.scaffoldEnabled !== undefined) row.scaffold_enabled = patch.scaffoldEnabled;
        if (patch.liveLeaderboard !== undefined) row.live_leaderboard = patch.liveLeaderboard;
        if (patch.lockAfterStart !== undefined) row.lock_after_start = patch.lockAfterStart;
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

    async saveText(
        participantId: string,
        token: string,
        roundIndex: number,
        contentHtml: string
    ): Promise<{ wordCount: number; savedAt: string }> {
        const { data, error } = await this.client.rpc('save_live_writing_text', {
            p_participant_id: participantId,
            p_token: token,
            p_round_index: roundIndex,
            p_content_html: contentHtml,
        });
        throwIfError(error);
        const row = firstRow(data);
        return { wordCount: number(row.word_count), savedAt: text(row.saved_at) };
    }

    async handIn(participantId: string, token: string, roundIndex: number): Promise<string> {
        const { data, error } = await this.client.rpc('hand_in_live_writing', {
            p_participant_id: participantId,
            p_token: token,
            p_round_index: roundIndex,
        });
        throwIfError(error);
        return text(firstRow(data).handed_in_at);
    }

    async selfCheck(
        participantId: string,
        token: string,
        roundIndex: number,
        rating: number,
        note: string
    ): Promise<void> {
        const { error } = await this.client.rpc('self_check_live_writing', {
            p_participant_id: participantId,
            p_token: token,
            p_round_index: roundIndex,
            p_rating: rating,
            p_note: note,
        });
        throwIfError(error);
    }

    async vote(participantId: string, token: string, roundIndex: number, chosenParticipantId: string): Promise<void> {
        const { error } = await this.client.rpc('submit_live_writing_vote', {
            p_participant_id: participantId,
            p_token: token,
            p_round_index: roundIndex,
            p_chosen_participant_id: chosenParticipantId,
        });
        throwIfError(error);
    }

    async setVoting(sessionId: string, roundIndex: number, open: boolean): Promise<void> {
        const { error } = await this.client.rpc('set_live_writing_voting', {
            p_session_id: sessionId,
            p_round_index: roundIndex,
            p_open: open,
        });
        throwIfError(error);
    }
}
