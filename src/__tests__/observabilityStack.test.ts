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

    it('only alerts on an unreachable Postgres when one is configured', () => {
        expect(rules).toContain('pg_up{db_host!=""}');
        expect(alloy).toContain('db_host = sys.env("SUPABASE_DB_HOST")');
        expect(service('alloy')).toContain('SUPABASE_DB_HOST: "${SUPABASE_DB_HOST:-}"');
    });

    it('never gives Grafana an empty email address, which stops it from starting', () => {
        expect(read('docker/observability/alerting/contact-points.yml')).toContain('addresses: "${ALERT_EMAIL}"');
        expect(service('grafana')).toMatch(/ALERT_EMAIL: "\$\{ALERT_EMAIL:-[^}\s]+@[^}\s]+\}"/);
    });

    it('reads scheduled-job failures through monitoring.failed_jobs(), not tables RLS hides', () => {
        const queries = [...rules.matchAll(/rawSql: (.+)/g)].map((m) => m[1]);
        expect(queries).toHaveLength(2);
        for (const query of queries) {
            expect(query).toContain('FROM monitoring.failed_jobs()');
            expect(query).not.toMatch(/\b(cron|net)\./);
        }
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
