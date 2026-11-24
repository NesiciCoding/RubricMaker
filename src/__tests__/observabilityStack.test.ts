import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const compose = read('docker-compose.observability.yml');
const alloy = read('docker/observability/config.alloy');
const rules = read('docker/observability/alerting/alert-rules.yml');

// Text of one top-level service block in the compose file.
function service(name: string): string {
    const parts = compose.split(new RegExp(`^ {2}${name}:\\s*$`, 'm'));
    expect(parts.length, `service ${name}`).toBe(2);
    return parts[1].split(/^ {2}[a-z][\w-]*:\s*$|^\S/m)[0];
}

const DATASOURCE_UIDS = ['loki', 'prometheus', 'client_logs_postgres'];

describe('observability stack (#867, #868)', () => {
    it('ships logs with Alloy, not the end-of-life Promtail', () => {
        expect(compose).not.toMatch(/^\s+promtail:/m);
        expect(compose).not.toContain('grafana/promtail');
        expect(readdirSync(resolve(root, 'docker/observability'))).not.toContain('promtail-config.yml');
        expect(service('alloy')).toContain('./docker/observability/config.alloy:/etc/alloy/config.alloy:ro');
    });

    it('pins every image to an exact version', () => {
        const images = [...compose.matchAll(/^\s+image:\s*(\S+)/gm)].map((m) => m[1]);
        expect(images.length).toBeGreaterThanOrEqual(5);
        for (const image of images) expect(image, image).toMatch(/:v?\d+\.\d+\.\d+$/);
    });

    it('keeps Alloy read positions in a volume so a restart does not re-send every log file', () => {
        expect(service('alloy')).toContain('alloy-data:/var/lib/alloy/data');
        expect(service('alloy')).toContain('--storage.path=/var/lib/alloy/data');
    });

    it('labels container logs job="docker", which the Web & Container Logs dashboard selects', () => {
        expect(alloy).toMatch(/target_label\s*=\s*"job"\s*\n\s*replacement\s*=\s*"docker"/);
        expect(read('docker/observability/dashboards/web-logs.json')).toContain('job=~\\"webserver|docker\\"');
    });

    it('ships container logs from the compose projects in ALLOY_DOCKER_PROJECTS, defaulting to rubricmaker', () => {
        expect(alloy).not.toContain('com.docker.compose.project=');
        expect(alloy).toContain('regex         = coalesce(sys.env("ALLOY_DOCKER_PROJECTS"), "rubricmaker")');
        expect(alloy).toContain('targets          = discovery.relabel.docker_projects.output');
        expect(service('alloy')).toContain('ALLOY_DOCKER_PROJECTS: "${ALLOY_DOCKER_PROJECTS:-rubricmaker}"');
        expect(read('.env.observability.example')).toContain('ALLOY_DOCKER_PROJECTS=');
    });

    it("reads HestiaCP's <domain>.log access logs without shipping its error logs twice", () => {
        expect(alloy).toContain('__path__         = "/var/host-logs/**/{logs,domains}/*.log"');
        expect(alloy).toContain('__path_exclude__ = "/var/host-logs/**/*{access,error}*.log"');
        expect(alloy).toContain('__path__ = "/var/host-logs/**/*{access,error}*.log*"');
    });

    it('never mounts the rootfs with rslave, which stops Alloy (and log shipping) on some hosts', () => {
        expect(service('alloy')).toContain('- /:/host/root:ro\n');
        expect(compose).not.toMatch(/^\s+- [^#\n]*:\S*rslave/m);
    });

    it('publishes only Grafana, and only on localhost', () => {
        for (const name of ['loki', 'alloy', 'prometheus', 'postgres-exporter']) {
            expect(service(name), name).not.toMatch(/^ {4}ports:/m);
        }
        expect(service('grafana')).toContain('"127.0.0.1:3001:3000"');
    });

    it('bounds Prometheus storage by time and size', () => {
        expect(service('prometheus')).toContain('--storage.tsdb.retention.time=${PROMETHEUS_RETENTION_TIME:-30d}');
        expect(service('prometheus')).toContain('--storage.tsdb.retention.size=${PROMETHEUS_RETENTION_SIZE:-2GB}');
    });

    it('stops Grafana downloading plugins at runtime', () => {
        expect(service('grafana')).toContain('GF_PLUGINS_PREINSTALL_DISABLED: "true"');
    });

    it('provisions dashboards that parse, have unique uids and use only provisioned datasources', () => {
        const dir = resolve(root, 'docker/observability/dashboards');
        const uids = new Set<string>();
        for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
            const dashboard = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
            expect(uids.has(dashboard.uid), file).toBe(false);
            uids.add(dashboard.uid);
            for (const [, uid] of JSON.stringify(dashboard).matchAll(/"uid":"([^"]+)"/g)) {
                if (uid !== dashboard.uid) expect(DATASOURCE_UIDS, `${file}: ${uid}`).toContain(uid);
            }
        }
        expect(uids).toContain('rubricmaker-host');
        expect(uids).toContain('rubricmaker-postgres');
        const datasources = read('docker/observability/grafana-datasources.yml');
        for (const uid of DATASOURCE_UIDS) expect(datasources).toContain(`uid: ${uid}`);
    });

    it('sets the Postgres default database in jsonData, which the query editor reads', () => {
        const postgres = read('docker/observability/grafana-datasources.yml')
            .split(/^ {2}- name: /m)
            .find((d) => d.includes('type: postgres'));
        expect(postgres).toMatch(/^ {4}jsonData:\n(?: {6}#.*\n)* {6}database: "\$\{SUPABASE_DB_NAME\}"$/m);
        expect(postgres).not.toMatch(/^ {4}database:/m);
    });
});

describe('alerting (#869)', () => {
    it('provisions rules with unique uids, a severity and known datasources', () => {
        const uids = [...rules.matchAll(/^ {2}- uid: (\S+)/gm)].map((m) => m[1]);
        expect(uids.length).toBeGreaterThanOrEqual(9);
        expect(new Set(uids).size).toBe(uids.length);
        expect([...rules.matchAll(/^ {6}severity: (\w+)/gm)].map((m) => m[1])).toHaveLength(uids.length);
        for (const [, uid] of rules.matchAll(/datasourceUid: (\S+)/g)) {
            expect([...DATASOURCE_UIDS, '__expr__']).toContain(uid);
        }
        expect(service('grafana')).toContain('./docker/observability/alerting:/etc/grafana/provisioning/alerting:ro');
    });

    it('covers disk, Postgres, scheduled jobs, the web tier and the monitoring stack itself', () => {
        for (const uid of [
            'rm-disk-almost-full',
            'rm-disk-full-soon',
            'rm-target-down',
            'rm-metrics-missing',
            'rm-cpu-steal',
            'rm-postgres-down',
            'rm-postgres-connections',
            'rm-pg-cron-failed',
            'rm-pg-net-failed',
            'rm-http-5xx-burst',
        ]) {
            expect(rules).toContain(`- uid: ${uid}\n`);
        }
    });

    it('counts 5xx by the status field, not by a response size that happens to start with 5', () => {
        const patterns = [
            /count_over_time\(\{job="webserver"\} \|~ `([^`]+)`/.exec(rules)?.[1],
            /rate\(\{job=\\"webserver\\"\} \|~ `([^`]+)`/.exec(
                read('docker/observability/dashboards/web-logs.json')
            )?.[1],
        ];
        const lines: [string, boolean][] = [
            ['1.2.3.4 - - [x] "GET /api HTTP/1.1" 502 157 "-" "curl/8"', true],
            ['1.2.3.4 - - [x] GET /api HTTP/1.1 "503" 190 "-" "Mozilla" "-"', true],
            ['1.2.3.4 - - [x] "GET /api HTTP/1.1" 200 512 "-" "Mozilla/5.0"', false],
            ['1.2.3.4 - - [x] GET /api HTTP/1.1 "200" 530 "-" "Mozilla" "-"', false],
            ['[Mon Oct 19] [proxy:error] [pid 512 ] AH00957: connect failed', false],
        ];
        for (const pattern of patterns) {
            expect(pattern).toBeDefined();
            const re = new RegExp(pattern!.replaceAll('\\"', '"'));
            for (const [line, is5xx] of lines) expect(re.test(line), line).toBe(is5xx);
        }
    });

    it('only alerts on an unreachable Postgres when one is configured', () => {
        expect(rules).toContain('pg_up{db_host!=""}');
        expect(alloy).toContain('db_host = sys.env("SUPABASE_DB_HOST")');
        expect(service('alloy')).toContain('SUPABASE_DB_HOST: "${SUPABASE_DB_HOST:-}"');
    });

    it('never gives Grafana an empty email address, which stops it from starting', () => {
        expect(read('docker/observability/alerting/contact-points.yml')).toContain('addresses: "${ALERT_EMAIL}"');
        expect(service('grafana')).toMatch(/ALERT_EMAIL: "\$\{ALERT_EMAIL:-[^}\s]+@[^}\s]+\}"/);
    });

    const rawQueries = () => [...rules.matchAll(/rawSql: (.+)/g)].map((m) => m[1]);

    it('reads scheduled-job failures through monitoring.failed_jobs(), not tables RLS hides', () => {
        const queries = rawQueries().filter((query) => !/\bclient_logs\b/.test(query));
        expect(queries).toHaveLength(2);
        for (const query of queries) {
            expect(query).toContain('FROM monitoring.failed_jobs()');
            expect(query).not.toMatch(/\b(cron|net)\./);
        }
    });

    it('reads browser errors from client_logs, which pg_monitor may select (migration 092)', () => {
        const queries = rawQueries().filter((query) => /\bclient_logs\b/.test(query));
        expect(queries).toHaveLength(1);
        expect(queries[0]).toContain("category = 'error'");
        // Counts only: the rule must not pull `meta` (or any row content) into an alert.
        expect(queries[0]).not.toMatch(/\bmeta\b/);
        const policy = read('supabase/migrations/092_monitoring_dashboard_reads.sql');
        expect(policy).toContain('grant select on public.client_logs to pg_monitor;');
        expect(policy).toContain('client_logs_monitor_select');
    });
});

describe('monitoring.failed_jobs() (migration 091)', () => {
    const migration = read('supabase/migrations/091_monitoring_job_failures.sql');

    it('pins search_path and is callable by pg_monitor only', () => {
        expect(migration).toMatch(/security definer\s+set search_path = ''/i);
        expect(migration).toContain('revoke all on function monitoring.failed_jobs(interval) from public;');
        expect(migration).toContain('grant execute on function monitoring.failed_jobs(interval) to pg_monitor;');
        expect(migration).not.toMatch(/to (anon|authenticated|service_role)\b/);
    });

    it('lives in a schema the REST API does not expose', () => {
        const schemas = /PGRST_DB_SCHEMAS:\s*"([^"]+)"/.exec(read('docker-compose.yml'))?.[1] ?? '';
        expect(schemas.split(',').map((s) => s.trim())).not.toContain('monitoring');
    });

    it('returns counts, never job commands or response bodies', () => {
        expect(migration).toMatch(/returns table \(failed_cron_runs bigint, failed_http_calls bigint\)/);
        expect(migration).not.toMatch(/select\s+[^;]*\b(command|return_message|content)\b/i);
    });
});

describe('Application Usage reads (migration 092)', () => {
    const migration = read('supabase/migrations/092_monitoring_dashboard_reads.sql');
    const dashboard = JSON.parse(read('docker/observability/dashboards/application-usage.json'));
    const queries: string[] = dashboard.panels.flatMap((p: { targets?: { rawSql: string }[] }) =>
        (p.targets ?? []).map((t) => t.rawSql)
    );
    const functions = [...migration.matchAll(/create or replace function (monitoring\.\w+)\(([^)]*)\)/g)];

    it('queries only the monitoring.app_* functions, never the tables row-level security hides', () => {
        expect(queries.length).toBeGreaterThanOrEqual(24);
        for (const query of queries) {
            expect(query).toMatch(/\bFROM monitoring\.app_\w+\(|^SELECT monitoring\.app_\w+\(/);
            expect(query).not.toMatch(/\b(FROM|JOIN)\s+(public\.)?[a-z_]+(\s|$)/i);
        }
    });

    it('defines every function a panel calls', () => {
        const defined = new Set(functions.map((m) => m[1]));
        for (const query of queries) {
            for (const [, name] of query.matchAll(/(monitoring\.app_\w+)\(/g)) expect(defined, name).toContain(name);
        }
    });

    it('pins search_path on every function and lets only pg_monitor call them', () => {
        expect(functions.length).toBe(6);
        const bodies = migration.split(/create or replace function /).slice(1);
        for (const body of bodies) expect(body).toMatch(/security definer\s+set search_path = ''/);
        for (const [, name, params] of functions) {
            const types = params
                .split(',')
                .map((p) => p.trim().split(/\s+/)[1])
                .filter(Boolean)
                .join(', ');
            expect(migration).toContain(`revoke all on function ${name}(${types}) from public;`);
            expect(migration).toContain(`grant execute on function ${name}(${types}) to pg_monitor;`);
        }
        expect(migration).not.toMatch(/to (anon|authenticated|service_role|public)\b/);
    });

    it('lets pg_monitor, and only pg_monitor, read client_logs past its row-level security', () => {
        expect(migration).toContain('grant select on public.client_logs to pg_monitor;');
        expect(migration).toMatch(/on public\.client_logs for select\s+to pg_monitor\s+using \(true\);/);
        expect(read('.env.observability.example')).not.toMatch(/^#\s+GRANT SELECT ON public\.client_logs/m);
    });
});

describe('School Highlights reads (migration 108)', () => {
    const migration = read('supabase/migrations/108_school_highlights.sql');
    const dashboard = JSON.parse(read('docker/observability/dashboards/school-highlights.json'));
    const queries: string[] = [
        ...dashboard.panels.flatMap((p: { targets?: { rawSql: string }[] }) => (p.targets ?? []).map((t) => t.rawSql)),
        ...dashboard.templating.list.map((v: { query: string }) => v.query),
    ];
    const functions = [...migration.matchAll(/create or replace function (monitoring\.\w+)\(([^)]*)\)/gi)];

    it('queries only the monitoring.hl_* functions, never the tables row-level security hides', () => {
        expect(queries.length).toBeGreaterThanOrEqual(10);
        for (const query of queries) {
            expect(query).toMatch(/monitoring\.hl_\w+\(/);
            expect(query).not.toMatch(/\b(FROM|JOIN)\s+(public\.)?(?!monitoring\.|\(|lv\b)[a-z_]+(\s|$)/i);
        }
    });

    it('defines every function a panel calls', () => {
        const defined = new Set(functions.map((m) => m[1]));
        for (const query of queries) {
            for (const [, name] of query.matchAll(/(monitoring\.hl_\w+)\(/g)) expect(defined, name).toContain(name);
        }
    });

    const reporting = [
        'monitoring.hl_cefr_distribution(text)',
        'monitoring.hl_cefr_trend(timestamptz, timestamptz)',
        'monitoring.hl_grammar_items(text)',
        'monitoring.hl_student_coverage()',
        'monitoring.hl_week_activity()',
    ];

    it('pins search_path on every definer function', () => {
        const bodies = migration.split(/create or replace function /i).slice(1);
        const definers = bodies.filter((b) => /security definer/i.test(b));
        expect(definers.length).toBeGreaterThanOrEqual(7);
        for (const body of definers) expect(body).toMatch(/security definer\s+set search_path = ''/i);
    });

    it('grants only the suppressed reporting functions to pg_monitor and revokes every helper', () => {
        for (const sig of reporting) expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO pg_monitor;`);
        for (const [, sig] of migration.matchAll(/GRANT EXECUTE ON FUNCTION ([^;]+?) TO /g)) {
            expect(reporting, `${sig} returns unsuppressed data`).toContain(sig);
        }
        for (const [, name, params] of functions.map((m) => [m[0], m[1], m[2]])) {
            const types = params
                .split(',')
                .map((p) => p.trim().split(/\s+/)[1] ?? p.trim().split(/\s+/)[0])
                .filter(Boolean)
                .join(', ');
            expect(migration).toContain(`REVOKE ALL ON FUNCTION ${name}(${types}) FROM PUBLIC;`);
        }
        expect(migration).not.toMatch(/GRANT EXECUTE[^;]*TO (anon|authenticated|service_role|public)\b/i);
    });

    it('holds every reporting function to the minimum cohort', () => {
        expect(migration).toMatch(/hl_min_cohort\(\)\s*RETURNS integer[\s\S]*?SELECT 5/i);
        const bodies = migration.split(/create or replace function /i).slice(1);
        const reads = bodies.filter((b) => /^monitoring\.hl_(cefr|grammar|student|week)/i.test(b));
        expect(reads.length).toBe(5);
        for (const body of reads) expect(body).toContain('monitoring.hl_min_cohort()');
    });

    it('groups by school id, never by display name', () => {
        const bodies = migration.split(/create or replace function /i).slice(1);
        for (const body of bodies.filter((b) => /^monitoring\.hl_(cefr|grammar|student|week|current)/i.test(b))) {
            if (/GROUP BY/i.test(body)) expect(body).toMatch(/GROUP BY[^\n]*school_id/i);
        }
    });

    it('never shows a suppressed cell as zero', () => {
        for (const query of queries) expect(query).not.toMatch(/coalesce\(\s*(\(\s*SELECT|max\()/i);
    });

    it('takes weekly shares over the visible levels only, so a share cannot reveal hidden students', () => {
        const trend = migration
            .split(/create or replace function /i)
            .find((b) => b.startsWith('monitoring.hl_cefr_trend'));
        expect(trend, 'hl_cefr_trend not found').toBeDefined();
        const totals = /totals AS \(([\s\S]*?)\n {2}\)/.exec(trend as string)?.[1] ?? '';
        expect(totals).toContain('hl_min_cohort()');
    });

    it('reports weekly activity only for five distinct students, from teachers who share', () => {
        const week = migration
            .split(/create or replace function /i)
            .find((b) => b.startsWith('monitoring.hl_week_activity'));
        expect(week, 'hl_week_activity not found').toBeDefined();
        expect(week).toMatch(/count\(DISTINCT e\.student\)[^\n]*>= monitoring\.hl_min_cohort\(\)/);
        expect(week).toContain('school_highlight_snapshots');
        expect(week).not.toMatch(/coalesce\(\s*sum\(/i);
    });

    it('keeps student identifiers out of the snapshot table', () => {
        const table = /CREATE TABLE IF NOT EXISTS public\.school_highlight_snapshots \(([\s\S]*?)\n\);/.exec(
            migration
        )?.[1];
        expect(table, 'snapshot table definition not found').toBeDefined();
        const columns = [...(table as string).matchAll(/^\s{2}([a-z_]+)\s+(?!KEY)[A-Z]/gm)].map((m) => m[1]);
        expect(columns.sort()).toEqual(['cefr', 'grammar', 'owner_id', 'snapshot_date', 'student_count', 'updated_at']);
    });
});
