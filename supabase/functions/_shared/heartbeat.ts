// Dead-man's-switch ping for scheduled jobs (Healthchecks.io, Better Stack, Uptime Kuma push
// monitors). Called only after a run fully succeeded, so a missed ping is the alert: it catches a
// failing job, a pg_cron schedule that stopped calling it, and a dead server alike. A failing
// ping never fails the job that already did its work.

const TIMEOUT_MS = 10_000;

export async function pingHeartbeat(url: string | undefined, fetchFn: typeof fetch = fetch): Promise<boolean> {
    if (!url) return false;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        console.warn('[heartbeat] ignoring a heartbeat URL that is not a valid URL');
        return false;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        console.warn('[heartbeat] ignoring a heartbeat URL that is not http(s)');
        return false;
    }
    try {
        const res = await fetchFn(parsed.toString(), { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) console.warn(`[heartbeat] ping returned HTTP ${res.status}`);
        return res.ok;
    } catch (e) {
        console.warn('[heartbeat] ping failed', e instanceof Error ? e.message : String(e));
        return false;
    }
}
