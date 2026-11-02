import { describe, expect, it } from 'vitest';
import {
    buildMimeMessage,
    isValidEmailAddress,
    sendMail,
    smtpConfigFromEnv,
    type SmtpConfig,
    type SmtpDialer,
    type SmtpSocket,
} from '../../supabase/functions/_shared/smtp.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Scripted SMTP server: replies to each client line according to `respond`, and records what the
// client sent and how the connection was secured.
function fakeServer(options: { ehlo?: string[]; afterTlsEhlo?: string[]; reject?: Record<string, string> } = {}) {
    const log: string[] = [];
    const events: string[] = [];
    let inData = false;
    let tls = false;
    let pending = '';
    const outbox: string[] = [];

    const ehloLines = () => (tls ? (options.afterTlsEhlo ?? ['AUTH PLAIN LOGIN']) : (options.ehlo ?? ['STARTTLS']));

    function respond(line: string) {
        if (inData) {
            if (line === '.') {
                inData = false;
                outbox.push('250 queued\r\n');
            } else {
                log.push(`DATA|${line}`);
            }
            return;
        }
        log.push(line);
        const verb = line.split(' ')[0].toUpperCase();
        const rejected = options.reject?.[verb];
        if (rejected) return outbox.push(`${rejected}\r\n`);
        if (verb === 'EHLO') {
            const ext = ehloLines();
            outbox.push(
                ['250-mail.example.nl', ...ext.map((e, i) => `250${i === ext.length - 1 ? ' ' : '-'}${e}`)].join(
                    '\r\n'
                ) + '\r\n'
            );
            if (ext.length === 0) outbox[outbox.length - 1] = '250 mail.example.nl\r\n';
        } else if (verb === 'STARTTLS') outbox.push('220 go ahead\r\n');
        else if (verb === 'AUTH' && line.startsWith('AUTH LOGIN')) outbox.push('334 VXNlcm5hbWU6\r\n');
        else if (verb === 'AUTH') outbox.push('235 ok\r\n');
        else if (verb === 'MAIL' || verb === 'RCPT') outbox.push('250 ok\r\n');
        else if (verb === 'DATA') {
            inData = true;
            outbox.push('354 go\r\n');
        } else if (verb === 'QUIT') outbox.push('221 bye\r\n');
        else if (log.at(-2)?.startsWith('AUTH LOGIN')) outbox.push('334 UGFzc3dvcmQ6\r\n');
        else outbox.push('235 ok\r\n');
    }

    function socket(): SmtpSocket {
        return {
            async read(buffer) {
                const next = outbox.shift();
                if (next === undefined) return null;
                const bytes = encoder.encode(next);
                buffer.set(bytes);
                return bytes.length;
            },
            async write(data) {
                pending += decoder.decode(data);
                let idx: number;
                while ((idx = pending.indexOf('\r\n')) >= 0) {
                    const line = pending.slice(0, idx);
                    pending = pending.slice(idx + 2);
                    respond(line);
                }
                return data.length;
            },
            close() {
                events.push('close');
            },
        };
    }

    const dialer: SmtpDialer = {
        async connect() {
            events.push('connect');
            outbox.push('220 mail.example.nl ESMTP\r\n');
            return socket();
        },
        async connectTls() {
            events.push('connectTls');
            tls = true;
            outbox.push('220 mail.example.nl ESMTP\r\n');
            return socket();
        },
        async startTls(s) {
            events.push('startTls');
            tls = true;
            return s;
        },
    };
    return { dialer, log, events };
}

const config: SmtpConfig = {
    host: 'mail.example.nl',
    port: 587,
    user: 'noreply@example.nl',
    pass: 'secret',
    fromAddress: 'noreply@example.nl',
    fromName: 'RubricMaker',
};
const message = { to: 'student@school.nl', subject: 'Nieuwe beoordeling: Essay', text: 'Hoi', html: '<p>Hoi</p>' };

describe('smtpConfigFromEnv', () => {
    it('reads the same SMTP_* variables as the auth container', () => {
        const env: Record<string, string> = {
            SMTP_HOST: 'mail.example.nl',
            SMTP_PORT: '465',
            SMTP_USER: 'u',
            SMTP_PASS: 'p',
            SMTP_ADMIN_EMAIL: 'noreply@example.nl',
            SMTP_SENDER_NAME: 'RubricMaker',
        };
        expect(smtpConfigFromEnv((k) => env[k])).toEqual({
            host: 'mail.example.nl',
            port: 465,
            user: 'u',
            pass: 'p',
            fromAddress: 'noreply@example.nl',
            fromName: 'RubricMaker',
        });
    });

    it('is null without a host, a valid sender or a valid port', () => {
        expect(smtpConfigFromEnv(() => undefined)).toBeNull();
        expect(smtpConfigFromEnv((k) => ({ SMTP_HOST: 'h', SMTP_ADMIN_EMAIL: 'nope' })[k])).toBeNull();
        expect(
            smtpConfigFromEnv((k) => ({ SMTP_HOST: 'h', SMTP_ADMIN_EMAIL: 'a@b.nl', SMTP_PORT: 'x' })[k])
        ).toBeNull();
    });

    it('defaults to port 587 and the RubricMaker sender name', () => {
        const cfg = smtpConfigFromEnv((k) => ({ SMTP_HOST: 'h', SMTP_ADMIN_EMAIL: 'a@b.nl' })[k]);
        expect(cfg).toMatchObject({ port: 587, fromAddress: 'a@b.nl', fromName: 'RubricMaker', user: undefined });
    });
});

describe('isValidEmailAddress', () => {
    it('rejects addresses that could inject SMTP commands or headers', () => {
        expect(isValidEmailAddress('student@school.nl')).toBe(true);
        expect(isValidEmailAddress('a@b.nl\r\nRCPT TO:<x@y.nl>')).toBe(false);
        expect(isValidEmailAddress('a@b.nl>')).toBe(false);
        expect(isValidEmailAddress('no-at-sign')).toBe(false);
    });
});

describe('buildMimeMessage', () => {
    it('builds a multipart message with encoded non-ASCII subject and base64 parts', () => {
        const mime = buildMimeMessage(
            config,
            { ...message, subject: 'Beoordeling “Essay” — klaar', text: 'Héllo', html: '<p>Héllo</p>' },
            new Date('2026-11-02T10:00:00Z'),
            'fixed-id'
        );
        expect(mime).toContain('From: "RubricMaker" <noreply@example.nl>');
        expect(mime).toContain('To: <student@school.nl>');
        expect(mime).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
        expect(mime).toContain('Message-ID: <fixed-id@example.nl>');
        expect(mime).toContain('Content-Type: multipart/alternative; boundary="rm-fixed-id"');
        expect(mime).toContain(Buffer.from('Héllo').toString('base64'));
        expect(mime.endsWith('--rm-fixed-id--\r\n')).toBe(true);
    });

    it('refuses a recipient that is not a plain address', () => {
        expect(() => buildMimeMessage(config, { ...message, to: 'x@y.nl\r\nBcc: z@w.nl' })).toThrow(
            'Invalid recipient'
        );
    });
});

describe('sendMail', () => {
    it('upgrades with STARTTLS before authenticating, then sends', async () => {
        const server = fakeServer();
        await sendMail(config, message, server.dialer);
        expect(server.events.slice(0, 2)).toEqual(['connect', 'startTls']);
        const commands = server.log.filter((l) => !l.startsWith('DATA|'));
        expect(commands).toEqual([
            'EHLO example.nl',
            'STARTTLS',
            'EHLO example.nl',
            `AUTH PLAIN ${Buffer.from('\0noreply@example.nl\0secret').toString('base64')}`,
            'MAIL FROM:<noreply@example.nl>',
            'RCPT TO:<student@school.nl>',
            'DATA',
            'QUIT',
        ]);
        expect(server.log.some((l) => l === 'DATA|To: <student@school.nl>')).toBe(true);
        expect(server.events.at(-1)).toBe('close');
    });

    it('uses implicit TLS on port 465', async () => {
        const server = fakeServer();
        await sendMail({ ...config, port: 465 }, message, server.dialer);
        expect(server.events[0]).toBe('connectTls');
        expect(server.log).not.toContain('STARTTLS');
    });

    it('uses AUTH LOGIN when the server does not offer PLAIN', async () => {
        const server = fakeServer({ afterTlsEhlo: ['AUTH LOGIN'] });
        await sendMail(config, message, server.dialer);
        expect(server.log).toContain('AUTH LOGIN');
        expect(server.log).toContain(Buffer.from('noreply@example.nl').toString('base64'));
        expect(server.log).toContain(Buffer.from('secret').toString('base64'));
    });

    it('refuses to send a password over a connection without TLS', async () => {
        const server = fakeServer({ ehlo: [] });
        await expect(sendMail(config, message, server.dialer)).rejects.toThrow('refusing to send the password');
        expect(server.log.some((l) => l.startsWith('AUTH'))).toBe(false);
        expect(server.events.at(-1)).toBe('close');
    });

    it('sends without TLS when no credentials are configured (local mail catcher)', async () => {
        const server = fakeServer({ ehlo: [] });
        await sendMail({ ...config, user: undefined, pass: undefined }, message, server.dialer);
        expect(server.log).toContain('MAIL FROM:<noreply@example.nl>');
    });

    it('reports the server reply when a command is rejected', async () => {
        const server = fakeServer({ reject: { RCPT: '550 5.1.1 no such user' } });
        await expect(sendMail(config, message, server.dialer)).rejects.toThrow('SMTP 550: 5.1.1 no such user');
    });

    it('times out and closes the socket when the server stops answering', async () => {
        const closed: string[] = [];
        const silent: SmtpSocket = {
            read: () => new Promise(() => undefined),
            write: async (d) => d.length,
            close: () => closed.push('close'),
        };
        const dialer: SmtpDialer = {
            connect: async () => silent,
            connectTls: async () => silent,
            startTls: async (s) => s,
        };
        await expect(sendMail(config, message, dialer, 20)).rejects.toThrow('timed out');
        expect(closed.length).toBeGreaterThan(0);
    });
});
