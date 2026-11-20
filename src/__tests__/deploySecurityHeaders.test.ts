/**
 * Every deployment config hand-maintains the security headers, and nothing checked that they agreed.
 * They had drifted: only `deploy/.htaccess` allowed `cdn.jsdelivr.net`, which tesseract.js needs for
 * its worker and core, so scanning handwriting worked on Apache and was blocked by CSP on nginx and
 * in the Docker image. They also still allowed the Google Fonts hosts, which stopped being used when
 * the fonts were vendored into `public/fonts`.
 *
 * This guards the two things that actually break a deployment — a header going missing, and the CSP
 * allowlist falling out of step with what the app calls — without asserting byte equality, because
 * the Apache and nginx front ends legitimately differ in how they write the same policy.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface DeployConfig {
    path: string;
    /** How the config spells a header. */
    syntax: 'nginx' | 'apache' | 'caddy';
    /** True when this file terminates TLS, so it must set HSTS. */
    tls: boolean;
    /** False for a proxy whose upstream nginx sets the content policy. */
    contentPolicy: boolean;
}

const CONFIGS: DeployConfig[] = [
    { path: 'deploy/nginx-hestiacp.conf', syntax: 'nginx', tls: true, contentPolicy: true },
    { path: 'deploy/nginx-virtualmin.conf', syntax: 'nginx', tls: true, contentPolicy: true },
    { path: 'deploy/apache-hestiacp.conf', syntax: 'apache', tls: true, contentPolicy: true },
    { path: 'deploy/apache-virtualmin.conf', syntax: 'apache', tls: true, contentPolicy: true },
    { path: 'deploy/.htaccess', syntax: 'apache', tls: true, contentPolicy: true },
    { path: 'docker/nginx.prod.conf', syntax: 'nginx', tls: false, contentPolicy: true },
    { path: 'docker/Caddyfile', syntax: 'caddy', tls: true, contentPolicy: false },
];

/** Hosts the app actually calls. Keep in step with the CSP when a new external service is added. */
const REQUIRED_CSP_HOSTS = [
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://api.languagetool.org',
    'https://api.commonstandardsproject.com',
    'https://api.dictionaryapi.dev',
    'https://api.mymemory.translated.net',
    'https://cdn.jsdelivr.net',
];

/** Self-hosted since the fonts were vendored; allowing them is a stale entry, not a fallback. */
const STALE_CSP_HOSTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

/** A self-hosted Supabase host is deployment-specific (the Docker stack uses the *.supabase.co wildcard or none), so it is left out of the comparison. */
const DEPLOYMENT_HOST = /^(?:https|wss):\/\/supabase\.(?:example\.com|rubricmaker\.nl)$/;

function read(config: DeployConfig): string {
    return readFileSync(join(process.cwd(), config.path), 'utf8');
}

function headersOf(config: DeployConfig): Map<string, string[]> {
    const text = read(config);
    const found = new Map<string, string[]>();
    const add = (name: string, value: string) => {
        const key = name.toLowerCase();
        found.set(key, [...(found.get(key) ?? []), value]);
    };
    const patterns =
        config.syntax === 'caddy'
            ? [/^\s*([A-Z][A-Za-z-]+)\s+"([^"]*)"/gm]
            : [
                  /^\s*add_header\s+([A-Za-z-]+)\s+"([^"]*)"/gm,
                  /^\s*Header\s+always\s+set\s+([A-Za-z-]+)\s+"([^"]*)"/gim,
              ];
    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) add(match[1], match[2]);
    }
    return found;
}

/** nginx repeats add_header inside a location block (a location replaces the parent's headers), so a
 * config may state the policy several times — but every statement has to be the same policy. */
function csp(config: DeployConfig): string {
    const values = headersOf(config).get('content-security-policy') ?? [];
    expect(values.length, `${config.path} sets no CSP`).toBeGreaterThan(0);
    for (const value of values) {
        expect(value, `${config.path} states two different policies`).toBe(values[0]);
    }
    return values[0];
}

/** `default-src 'self'; script-src …` → directive → tokens. */
function directives(policy: string): Map<string, string[]> {
    const parsed = new Map<string, string[]>();
    for (const part of policy.split(';')) {
        const [name, ...tokens] = part.trim().split(/\s+/).filter(Boolean);
        if (!name) continue;
        // A browser keeps the first occurrence of a repeated directive, so a later one must not win.
        if (!parsed.has(name.toLowerCase())) parsed.set(name.toLowerCase(), tokens);
    }
    return parsed;
}

function cspHosts(policy: string): Set<string> {
    const hosts = new Set<string>();
    for (const tokens of directives(policy).values()) {
        for (const token of tokens) {
            if (/^(https?:|wss:)/.test(token) && !DEPLOYMENT_HOST.test(token)) hosts.add(token);
        }
    }
    return hosts;
}

const policyConfigs = CONFIGS.filter((config) => config.contentPolicy);

describe('deploy security headers', () => {
    for (const config of policyConfigs) {
        it(`${config.path} sets every required header`, () => {
            const headers = headersOf(config);
            for (const name of [
                'content-security-policy',
                'x-content-type-options',
                'referrer-policy',
                'permissions-policy',
                'x-frame-options',
            ]) {
                expect(headers.has(name), `${config.path} is missing ${name}`).toBe(true);
            }
            for (const [name, values] of headers) {
                for (const value of values) expect(value.trim(), `${config.path}: ${name} is empty`).not.toBe('');
            }
        });
    }

    for (const config of CONFIGS.filter((entry) => entry.tls)) {
        it(`${config.path} terminates TLS, so it sets HSTS`, () => {
            expect(headersOf(config).get('strict-transport-security')?.join(' ')).toContain('max-age=');
        });
    }

    for (const config of policyConfigs) {
        it(`${config.path} keeps the hardening directives`, () => {
            const parsed = directives(csp(config));
            expect(parsed.get('default-src')).toEqual(["'self'"]);
            expect(parsed.get('object-src')).toEqual(["'none'"]);
            expect(parsed.get('base-uri')).toEqual(["'self'"]);
            expect(parsed.get('frame-ancestors')).toEqual(["'self'"]);
            // The signature pad and the recorder need a blob: worker and media element.
            expect(parsed.get('worker-src')).toContain('blob:');
        });

        it(`${config.path} allows every host the app calls`, () => {
            const parsed = directives(csp(config));
            const connect = parsed.get('connect-src') ?? [];
            for (const host of REQUIRED_CSP_HOSTS) {
                if (host === 'https://cdn.jsdelivr.net') {
                    // tesseract.js fetches and runs its worker and core from jsDelivr.
                    expect(parsed.get('script-src'), `${config.path}: script-src`).toContain(host);
                    expect(parsed.get('worker-src'), `${config.path}: worker-src`).toContain(host);
                    expect(connect, `${config.path}: connect-src`).toContain(host);
                    continue;
                }
                expect(connect, `${config.path}: connect-src`).toContain(host);
            }
        });

        it(`${config.path} does not allow the self-hosted font hosts`, () => {
            const policy = csp(config);
            for (const host of STALE_CSP_HOSTS) {
                expect(policy, `${config.path} still allows ${host}, but the fonts are vendored`).not.toContain(host);
            }
        });

        it(`${config.path} allows the camera and microphone for the scan and recorder`, () => {
            const policy = headersOf(config).get('permissions-policy')?.[0] ?? '';
            expect(policy).toContain('camera=(self)');
            expect(policy).toContain('microphone=(self)');
        });
    }

    it('every config allows the same external hosts', () => {
        const [first, ...rest] = policyConfigs.map((config) => ({
            path: config.path,
            hosts: [...cspHosts(csp(config))].sort(),
        }));
        for (const config of rest) {
            expect(config.hosts, `${config.path} disagrees with ${first.path}`).toEqual(first.hosts);
        }
    });
});
