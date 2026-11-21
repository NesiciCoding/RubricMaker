/**
 * In-memory stand-in for the live-writing Supabase surface (#1153).
 *
 * The two-context spec and the three live routes in the axe gate need the console, the projector and
 * the joined student screen to render and to move through the session state machine without a local
 * Supabase stack. This fake intercepts the PostgREST/RPC/auth/storage calls the pages actually make
 * and keeps the session state in the test process, so a teacher page and a student page opened in a
 * second browser context share one "database".
 *
 * It mirrors the shipped SQL contract rather than inventing one: `end_writing` moves a peer-voting
 * session to `voting` with votes open (103_live_writing_self_check_peer_voting.sql), the finals panel
 * renders for `finals`/`closed`, and the student RPCs are token-scoped. It deliberately does not
 * verify RLS or the SQL itself — the migration tests and the stack-backed specs cover that.
 */
import type { Page, Route } from '@playwright/test';

/** Shaped so `isAllowedSupabaseUrl` accepts it (http + loopback) and supabase-js derives `sb-localhost-*`. */
const LIVE_WRITING_SUPABASE_URL = 'http://localhost:54321';
const LIVE_WRITING_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7W9oHv2oGAXG7XLHCB0PkMGUjwkH0ZFJNF4';
const LIVE_WRITING_USER_ID = '00000000-0000-4000-8000-00000000e2e1';

type LiveWritingStatus = 'draft' | 'lobby' | 'writing' | 'voting' | 'finals' | 'closed';

export interface BackendOptions {
    sessionId?: string;
    joinCode?: string;
    status?: LiveWritingStatus;
    /** Content the student already has on the server when the session is opened. */
    draftHtml?: string;
    /** Settings row returned by hydration; a partial object crashes the builder screens. */
    settings?: Record<string, unknown>;
}

const DEFAULT_FORMAT = {
    criterionColWidth: 200,
    levelColWidth: 160,
    fontSize: 14,
    headerColor: '#1e3a5f',
    headerTextColor: '#ffffff',
    accentColor: '#3b82f6',
    fontFamily: 'Inter, system-ui, sans-serif',
    showWeights: true,
    showPoints: true,
    showCalculatedGrade: true,
    levelOrder: 'best-first',
    headerTextAlign: 'center',
    showBorders: true,
    rowStriping: false,
    orientation: 'portrait',
};

const DEFAULT_SETTINGS = {
    defaultGradeScaleId: 'letter-10',
    theme: 'light',
    language: 'en',
    accentColor: '#3b82f6',
    hasSeenTutorial: true,
    needsOnboarding: false,
    userRole: 'admin',
    defaultFormat: DEFAULT_FORMAT,
};

function parseBody(raw: string | null): Record<string, unknown> {
    try {
        const value: unknown = JSON.parse(raw ?? '{}');
        return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

function words(html: string): number {
    const text = html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .trim();
    return text === '' ? 0 : text.split(/\s+/).length;
}

function paragraph(text: string): string {
    return `<p>${text}</p>`;
}

const ROSTER = [
    { studentId: 'student-e2e-1', name: 'Aiko Tanaka' },
    { studentId: 'student-e2e-2', name: 'Bram de Vries' },
];

export class LiveWritingBackend {
    readonly sessionId: string;
    title: string;
    prompt: string;
    joinCode: string;
    classId: string;
    status: LiveWritingStatus;
    roundCount = 1;
    currentRound = 1;
    minutesPerRound = 5;
    minWords = 20;
    peerVoting = true;
    votesOpen = false;
    timerState: 'idle' | 'running' | 'paused' | 'ended' = 'idle';
    timerEndsAt: string | null = null;
    timerRemainingMs = 0;
    readonly roster = ROSTER;
    settings: Record<string, unknown>;

    readonly participant = {
        id: 'participant-e2e-1',
        token: 'join-token-e2e-1',
        studentId: 'student-e2e-1',
        displayName: 'Aiko Tanaka',
        contentHtml: '',
        handedInAt: null as string | null,
        selfRating: null as string | null,
        selfNote: '' as string,
        voted: false,
        gradingSubmissionId: null as string | null,
    };

    constructor(options: BackendOptions = {}) {
        this.sessionId = options.sessionId ?? 'live-session-e2e-1';
        this.title = 'Free write: my perfect weekend';
        this.prompt = 'Describe what your perfect weekend would look like.';
        this.joinCode = options.joinCode ?? 'RM-E2E123';
        this.classId = 'class-e2e-1';
        this.status = options.status ?? 'draft';
        this.roundCount = 1;
        this.minutesPerRound = 5;
        this.minWords = 20;
        this.peerVoting = true;
        this.settings = { ...DEFAULT_SETTINGS, ...(options.settings ?? {}) };
        this.participant.contentHtml = options.draftHtml ?? '';
        if (this.status === 'writing') this.startTimer();
    }

    /** Session row in the shape `mapSession`/the SQL RPCs return (snake_case). */
    get sessionRow(): Record<string, unknown> {
        return {
            id: this.sessionId,
            class_id: this.classId,
            title: this.title,
            prompt: this.prompt,
            image_path: null,
            status: this.status,
            join_code: this.joinCode,
            join_code_expires_at: null,
            round_count: this.roundCount,
            current_round: this.currentRound,
            minutes_per_round: this.minutesPerRound,
            min_words: this.minWords,
            max_words: null,
            scaffold_enabled: true,
            scaffold_prompts: ['Start with where you are.', 'Add one reason why.', 'Finish with how you feel.'],
            live_leaderboard: true,
            lock_after_start: false,
            peer_voting: this.peerVoting,
            votes_open: this.votesOpen,
            timer_state: this.timerState,
            timer_ends_at: this.timerEndsAt,
            timer_remaining_ms: this.timerRemainingMs,
            show_progress_board: true,
            created_at: '2026-11-21T09:00:00.000Z',
            updated_at: '2026-11-21T09:00:00.000Z',
            started_at: null,
            ended_at: null,
        };
    }

    get timerRow(): Record<string, unknown> {
        return {
            status: this.status,
            timer_state: this.timerState,
            timer_ends_at: this.timerEndsAt,
            timer_remaining_ms: this.timerRemainingMs,
            server_now: new Date().toISOString(),
            current_round: this.currentRound,
            round_count: this.roundCount,
            minutes_per_round: this.minutesPerRound,
            show_progress_board: true,
        };
    }

    get studentStateRow(): Record<string, unknown> {
        return {
            session_id: this.sessionId,
            participant_id: this.participant.id,
            display_name: this.participant.displayName,
            session_title: this.title,
            session_status: this.status,
            timer_state: this.timerState,
            timer_ends_at: this.timerEndsAt,
            timer_remaining_ms: this.timerRemainingMs,
            server_now: new Date().toISOString(),
            current_round: this.currentRound,
            round_count: this.roundCount,
            minutes_per_round: this.minutesPerRound,
            min_words: this.minWords,
            max_words: null,
            prompt: this.prompt,
            image_path: null,
            scaffold_enabled: true,
            scaffold_prompts: [],
            peer_voting: this.peerVoting,
            response_round_index: this.currentRound,
            content_html: this.participant.contentHtml,
            word_count: words(this.participant.contentHtml),
            cefr_estimate: null,
            handed_in_at: this.participant.handedInAt,
            self_rating: this.participant.selfRating,
            self_note: this.participant.selfNote,
        };
    }

    get participantRow(): Record<string, unknown> {
        return {
            id: this.participant.id,
            session_id: this.sessionId,
            student_id: this.participant.studentId,
            display_name: this.participant.displayName,
            joined_at: '2026-11-21T09:05:00.000Z',
            last_seen_at: '2026-11-21T09:06:00.000Z',
        };
    }

    get finalRow(): Record<string, unknown> {
        return {
            participant_id: this.participant.id,
            student_id: this.participant.studentId,
            display_name: this.participant.displayName,
            content_html: this.participant.contentHtml,
            word_count: words(this.participant.contentHtml),
            cefr_estimate: null,
            self_rating: this.participant.selfRating,
            self_note: this.participant.selfNote,
            votes_received: this.participant.voted ? 1 : 0,
            final_hidden: false,
            handed_in_at: this.participant.handedInAt,
            grading_assignment_id: null,
            grading_submission_id: this.participant.gradingSubmissionId,
        };
    }

    private startTimer(): void {
        this.timerState = 'running';
        this.timerEndsAt = new Date(Date.now() + this.minutesPerRound * 60_000).toISOString();
    }

    private rpc(name: string, body: Record<string, unknown>): { body: unknown; status?: number } {
        const action = typeof body.p_action === 'string' ? body.p_action : '';
        switch (name) {
            case 'live_writing_roster':
                if (body.p_code !== this.joinCode) {
                    return { body: { message: 'invalid_code' }, status: 400 };
                }
                return { body: this.roster.map((s) => ({ student_id: s.studentId, name: s.name })) };

            case 'join_live_writing_session':
                return {
                    body: [
                        {
                            participant_id: this.participant.id,
                            join_token: this.participant.token,
                            title: this.title,
                            status: this.status,
                            current_round: this.currentRound,
                            round_count: this.roundCount,
                            minutes_per_round: this.minutesPerRound,
                            min_words: this.minWords,
                            max_words: null,
                            scaffold_enabled: true,
                        },
                    ],
                };

            case 'get_live_writing_student_state':
                if (body.p_token !== this.participant.token) {
                    return { body: { message: 'invalid_token' }, status: 400 };
                }
                return { body: [this.studentStateRow] };

            case 'save_live_writing_text': {
                const html = String(body.p_content_html ?? '');
                if (this.participant.handedInAt) return { body: { message: 'already_handed_in' }, status: 400 };
                this.participant.contentHtml = html;
                return { body: [{ word_count: words(html), saved_at: new Date().toISOString() }] };
            }

            case 'hand_in_live_writing': {
                const html = String(body.p_content_html ?? this.participant.contentHtml);
                this.participant.contentHtml = html;
                this.participant.handedInAt = this.participant.handedInAt ?? new Date().toISOString();
                return { body: [{ handed_in_at: this.participant.handedInAt }] };
            }

            case 'self_check_live_writing':
                this.participant.selfRating = String(body.p_rating ?? 'neutral');
                this.participant.selfNote = String(body.p_note ?? '');
                return {
                    body: [{ self_rating: this.participant.selfRating, self_note: this.participant.selfNote }],
                };

            case 'get_live_writing_vote_state':
                return {
                    body: [
                        {
                            session_status: this.status,
                            current_round: this.currentRound,
                            round_count: this.roundCount,
                            peer_voting: this.peerVoting,
                            votes_open: this.votesOpen,
                            self_rating: this.participant.selfRating,
                            self_note: this.participant.selfNote,
                            has_pair: true,
                            voted: this.participant.voted,
                            option_a_html: paragraph('My perfect weekend starts with a long walk before breakfast.'),
                            option_b_html: paragraph('I would sleep until noon and then meet my friends in town.'),
                            option_a_word_count: 10,
                            option_b_word_count: 13,
                        },
                    ],
                };

            case 'submit_live_writing_vote':
                this.participant.voted = true;
                return { body: null, status: 204 };

            case 'get_live_writing_finals':
                return { body: this.participant.handedInAt ? [this.finalRow] : [] };

            case 'set_live_writing_grading_handoff':
                this.participant.gradingSubmissionId = String(body.p_submission_id ?? 'lw-submission-e2e-1');
                return { body: null, status: 204 };

            case 'start_live_writing_session':
                this.status = 'writing';
                this.startTimer();
                return { body: [this.timerRow] };

            case 'control_live_writing_timer':
                if (action === 'pause') {
                    this.timerState = 'paused';
                    this.timerEndsAt = null;
                } else if (action === 'resume') {
                    this.startTimer();
                } else if (action === 'end_writing') {
                    this.status = this.peerVoting ? 'voting' : 'finals';
                    this.votesOpen = this.peerVoting;
                    this.timerState = 'ended';
                    this.timerEndsAt = null;
                } else if (action === 'end_session') {
                    this.status = 'closed';
                    this.votesOpen = false;
                    this.timerState = 'ended';
                    this.timerEndsAt = null;
                }
                return { body: [this.timerRow] };

            case 'get_live_writing_timer':
                return { body: [this.timerRow] };

            default:
                return { body: null, status: 204 };
        }
    }

    /**
     * Intercept every request the live-writing screens make. The shared closure state is what makes a
     * second context see the teacher's actions; install it on each page that takes part.
     */
    async install(page: Page): Promise<void> {
        await page.route('**/rest/v1/**', (route) => this.handleRest(route));
        await page.route('**/auth/v1/**', (route) => this.handleAuth(route));
        await page.route('**/storage/v1/**', (route) => this.handleStorage(route));
    }

    private async handleRest(route: Route): Promise<void> {
        const url = new URL(route.request().url());
        const path = url.pathname.replace(/^\/rest\/v1\/?/, '');
        const method = route.request().method();
        const wantsSingle = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');

        const respond = (body: unknown, status = 200) =>
            route.fulfill({
                status,
                contentType: 'application/json',
                body: body === null ? '' : JSON.stringify(body),
            });

        if (path.startsWith('rpc/')) {
            const body = parseBody(route.request().postData());
            const result = this.rpc(path.slice(4), body);
            return respond(result.body, result.status ?? 200);
        }

        const table = path.split('/')[0];
        switch (table) {
            case 'live_writing_sessions':
                if (method === 'POST') {
                    const input = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
                    this.title = String(input.title ?? this.title);
                    this.prompt = String(input.prompt ?? this.prompt);
                    this.classId = String(input.class_id ?? this.classId);
                    this.minutesPerRound = Number(input.minutes_per_round ?? this.minutesPerRound);
                    this.roundCount = Number(input.round_count ?? this.roundCount);
                    this.minWords = Number(input.min_words ?? this.minWords);
                    this.peerVoting = Boolean(input.peer_voting ?? this.peerVoting);
                    this.status = 'draft';
                    return respond(this.sessionRow, 201);
                }
                if (method === 'PATCH') {
                    const patch = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
                    if (typeof patch.status === 'string') this.status = patch.status as LiveWritingStatus;
                    if (patch.votes_open !== undefined) this.votesOpen = Boolean(patch.votes_open);
                    if (patch.title !== undefined) this.title = String(patch.title);
                    return respond(this.sessionRow);
                }
                if (wantsSingle) return respond(this.sessionRow);
                return respond([this.sessionRow]);

            case 'live_writing_participants':
                if (method === 'GET' && url.searchParams.get('select')?.includes('word_count')) {
                    return respond([this.participantRow]);
                }
                return respond(this.status === 'draft' ? [] : [this.participantRow]);

            case 'live_writing_responses':
                return respond([
                    {
                        participant_id: this.participant.id,
                        word_count: words(this.participant.contentHtml),
                        cefr_estimate: null,
                        handed_in_at: this.participant.handedInAt,
                    },
                ]);

            case 'essay_submissions':
                if (method === 'GET') {
                    return respond(
                        this.participant.gradingSubmissionId ? { id: this.participant.gradingSubmissionId } : null
                    );
                }
                return respond(null, 201);

            case 'rubrics':
                // Hydration skips a failed collection and leaves the local snapshot alone, which is
                // how the seeded rubric reaches the finals hand-off select.
                return respond({ message: 'not_implemented_in_e2e_fake' }, 500);

            case 'profiles':
                return respond({
                    id: LIVE_WRITING_USER_ID,
                    email: 'teacher-e2e@example.com',
                    display_name: 'E2E Teacher',
                    role: 'teacher',
                    school_id: 'school-e2e-1',
                });

            case 'user_settings':
                // A complete settings row, because hydration applies it over the seeded one and a
                // partial object crashes the builder screens.
                return respond({ user_id: LIVE_WRITING_USER_ID, settings: this.settings });

            default:
                return respond(wantsSingle ? null : []);
        }
    }

    private async handleAuth(route: Route): Promise<void> {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/user')) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: LIVE_WRITING_USER_ID,
                    email: 'teacher-e2e@example.com',
                    aud: 'authenticated',
                    role: 'authenticated',
                }),
            });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    private async handleStorage(route: Route): Promise<void> {
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ Key: route.request().url() }),
        });
    }
}

export function createLiveWritingBackend(options: BackendOptions = {}): LiveWritingBackend {
    return new LiveWritingBackend(options);
}

function fakeJwt(): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return [
        encode({ alg: 'HS256', typ: 'JWT' }),
        encode({ sub: LIVE_WRITING_USER_ID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 }),
        'e2e-signature',
    ].join('.');
}

/**
 * Seed a signed-in connected app. supabase-js reads its session from `sb-<project-ref>-auth-token`
 * without a network round-trip, which is what lets the collection pages mount instead of the landing
 * screen — the same thing the Supabase specs get from a real magic-link sign-in.
 */
export async function seedLiveWritingApp(
    page: Page,
    options: { localStorage?: Record<string, unknown>; sessionStorage?: Record<string, string> } = {}
): Promise<void> {
    const session = {
        access_token: fakeJwt(),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'e2e-refresh-token',
        user: {
            id: LIVE_WRITING_USER_ID,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'teacher-e2e@example.com',
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: '2026-11-21T09:00:00.000Z',
        },
    };

    await page.addInitScript(
        ({ url, key, sessionValue, seed, sessionSeed }) => {
            localStorage.setItem('rm_supabase_config', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }));
            localStorage.setItem('rm_migration_done', 'true');
            localStorage.setItem('sb-localhost-auth-token', JSON.stringify(sessionValue));
            for (const [name, value] of Object.entries(seed)) {
                if (value !== undefined) localStorage.setItem(name, JSON.stringify(value));
            }
            for (const [name, value] of Object.entries(sessionSeed)) {
                sessionStorage.setItem(name, value);
            }
        },
        {
            url: LIVE_WRITING_SUPABASE_URL,
            key: LIVE_WRITING_ANON_KEY,
            sessionValue: session,
            seed: options.localStorage ?? {},
            sessionSeed: options.sessionStorage ?? {},
        }
    );
}

/**
 * The product tour opens as a modal over the first screen, late enough to race a click. Wait briefly
 * for it either way, then dismiss it so its overlay cannot swallow the next click.
 */
export async function dismissTour(page: Page): Promise<void> {
    const skip = page.getByRole('button', { name: 'Skip tour' });
    await skip
        .first()
        .waitFor({ state: 'visible', timeout: 2000 })
        .catch(() => undefined);
    if (
        await skip
            .first()
            .isVisible()
            .catch(() => false)
    ) {
        await skip
            .first()
            .click({ timeout: 5000 })
            .catch(() => undefined);
        await page
            .locator('[role="alertdialog"], [role="dialog"]')
            .waitFor({ state: 'hidden', timeout: 5000 })
            .catch(() => undefined);
    }
}

/** The per-tab join record the student screen uses to resume instead of showing the name picker. */
export function studentJoinStorage(code: string, backend: LiveWritingBackend): Record<string, string> {
    return {
        [`rm_live_write_join:${code}`]: JSON.stringify({
            participantId: backend.participant.id,
            joinToken: backend.participant.token,
        }),
    };
}
