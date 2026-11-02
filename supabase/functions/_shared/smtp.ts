// Minimal SMTP submission client (RFC 5321 + STARTTLS + AUTH PLAIN/LOGIN) for the notification
// edge functions. Edge functions may only depend on the Deno standard library and supabase-js, so
// this speaks the protocol itself over a socket the caller supplies; the Deno socket glue lives in
// ../_deno/mail.ts, which keeps this file runtime-neutral and testable from Vitest.

export interface SmtpSocket {
    read(buffer: Uint8Array): Promise<number | null>;
    write(data: Uint8Array): Promise<number>;
    close(): void;
}

export interface SmtpDialer {
    connect(hostname: string, port: number): Promise<SmtpSocket>;
    connectTls(hostname: string, port: number): Promise<SmtpSocket>;
    startTls(socket: SmtpSocket, hostname: string): Promise<SmtpSocket>;
}

export interface SmtpConfig {
    host: string;
    port: number;
    user?: string;
    pass?: string;
    fromAddress: string;
    fromName?: string;
}

export interface MailMessage {
    to: string;
    subject: string;
    text: string;
    html: string;
}

const SMTP_TIMEOUT_MS = 30_000;
const MAX_REPLY_BYTES = 64 * 1024;
const ADDRESS_RE = /^[^\s<>"(),;:@\\]+@[^\s<>"(),;:@\\]+\.[^\s<>"(),;:@\\]+$/;

export class SmtpError extends Error {
    constructor(
        message: string,
        readonly code?: number
    ) {
        super(message);
        this.name = 'SmtpError';
    }
}

export function isValidEmailAddress(address: string): boolean {
    return address.length <= 254 && ADDRESS_RE.test(address);
}

// Reads SMTP_* the same way the auth container does, so one .env block configures both.
export function smtpConfigFromEnv(get: (name: string) => string | undefined): SmtpConfig | null {
    const host = get('SMTP_HOST')?.trim();
    const fromAddress = get('SMTP_ADMIN_EMAIL')?.trim();
    if (!host || !fromAddress || !isValidEmailAddress(fromAddress)) return null;
    const port = Number(get('SMTP_PORT') ?? '587');
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
    const user = get('SMTP_USER')?.trim() || undefined;
    const pass = get('SMTP_PASS') || undefined;
    const fromName = get('SMTP_SENDER_NAME')?.trim() || 'RubricMaker';
    return { host, port, user, pass, fromAddress, fromName };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Utf8(value: string): string {
    const bytes = encoder.encode(value);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function wrap76(value: string): string {
    return value.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

function encodeHeaderWord(value: string): string {
    const clean = value.replace(/[\r\n]+/g, ' ');

    return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${base64Utf8(clean)}?=`;
}

function domainOf(address: string): string {
    return address.slice(address.lastIndexOf('@') + 1);
}

export function buildMimeMessage(
    config: SmtpConfig,
    message: MailMessage,
    now = new Date(),
    id: string = crypto.randomUUID()
): string {
    if (!isValidEmailAddress(message.to)) throw new SmtpError('Invalid recipient address');
    const domain = domainOf(config.fromAddress);
    const boundary = `rm-${id}`;
    const from = config.fromName
        ? `"${encodeHeaderWord(config.fromName).replace(/["\\]/g, '')}" <${config.fromAddress}>`
        : `<${config.fromAddress}>`;
    const headers = [
        `From: ${from}`,
        `To: <${message.to}>`,
        `Subject: ${encodeHeaderWord(message.subject)}`,
        `Date: ${now.toUTCString()}`,
        `Message-ID: <${id}@${domain}>`,
        'MIME-Version: 1.0',
        'Auto-Submitted: auto-generated',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ];
    const part = (type: string, body: string) =>
        [
            `--${boundary}`,
            `Content-Type: ${type}; charset=UTF-8`,
            'Content-Transfer-Encoding: base64',
            '',
            wrap76(base64Utf8(body)),
        ].join('\r\n');
    return [
        headers.join('\r\n'),
        '',
        part('text/plain', message.text),
        part('text/html', message.html),
        `--${boundary}--`,
        '',
    ].join('\r\n');
}

class ReplyReader {
    private buffered = '';

    constructor(private socket: SmtpSocket) {}

    private async readLine(): Promise<string> {
        for (;;) {
            const end = this.buffered.indexOf('\r\n');
            if (end >= 0) {
                const line = this.buffered.slice(0, end);
                this.buffered = this.buffered.slice(end + 2);
                return line;
            }
            if (this.buffered.length > MAX_REPLY_BYTES) throw new SmtpError('SMTP reply too long');
            const chunk = new Uint8Array(4096);
            const n = await this.socket.read(chunk);
            if (n === null) throw new SmtpError('SMTP server closed the connection');
            this.buffered += decoder.decode(chunk.subarray(0, n));
        }
    }

    async reply(): Promise<{ code: number; lines: string[] }> {
        const lines: string[] = [];
        for (;;) {
            const line = await this.readLine();
            const code = Number(line.slice(0, 3));
            if (!Number.isInteger(code)) throw new SmtpError(`Malformed SMTP reply: ${line.slice(0, 80)}`);
            lines.push(line.slice(4));
            if (line[3] !== '-') return { code, lines };
        }
    }
}

class Session {
    private reader: ReplyReader;

    constructor(public socket: SmtpSocket) {
        this.reader = new ReplyReader(socket);
    }

    async expect(...codes: number[]): Promise<string[]> {
        const { code, lines } = await this.reader.reply();
        if (!codes.includes(code)) throw new SmtpError(`SMTP ${code}: ${lines.join(' ').slice(0, 200)}`, code);
        return lines;
    }

    async send(line: string, ...codes: number[]): Promise<string[]> {
        await this.socket.write(encoder.encode(`${line}\r\n`));
        return this.expect(...codes);
    }

    async ehlo(name: string): Promise<Set<string>> {
        const lines = await this.send(`EHLO ${name}`, 250);
        return new Set(lines.slice(1).map((l) => l.toUpperCase()));
    }
}

function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            onTimeout();
            reject(new SmtpError('SMTP timed out'));
        }, ms);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function sendMail(
    config: SmtpConfig,
    message: MailMessage,
    dialer: SmtpDialer,
    timeoutMs = SMTP_TIMEOUT_MS
): Promise<void> {
    const data = buildMimeMessage(config, message);
    const implicitTls = config.port === 465;
    let session: Session | null = null;
    const close = () => {
        try {
            session?.socket.close();
        } catch {
            // already closed
        }
    };

    const run = async () => {
        session = new Session(
            implicitTls
                ? await dialer.connectTls(config.host, config.port)
                : await dialer.connect(config.host, config.port)
        );
        const heloName = domainOf(config.fromAddress);
        await session.expect(220);
        let features = await session.ehlo(heloName);
        let secure = implicitTls;
        if (!secure && features.has('STARTTLS')) {
            await session.send('STARTTLS', 220);
            session = new Session(await dialer.startTls(session.socket, config.host));
            secure = true;
            features = await session.ehlo(heloName);
        }
        if (config.user && config.pass) {
            if (!secure)
                throw new SmtpError('SMTP server does not offer TLS; refusing to send the password in clear text');
            const auth = [...features].find((f) => f.startsWith('AUTH')) ?? '';
            if (/\bPLAIN\b/.test(auth) || !/\bLOGIN\b/.test(auth)) {
                await session.send(`AUTH PLAIN ${base64Utf8(`\0${config.user}\0${config.pass}`)}`, 235);
            } else {
                await session.send('AUTH LOGIN', 334);
                await session.send(base64Utf8(config.user), 334);
                await session.send(base64Utf8(config.pass), 235);
            }
        }
        await session.send(`MAIL FROM:<${config.fromAddress}>`, 250);
        await session.send(`RCPT TO:<${message.to}>`, 250, 251);
        await session.send('DATA', 354);
        const body = data.replace(/\r\n\./g, '\r\n..');
        await session.socket.write(encoder.encode(`${body}\r\n.\r\n`));
        await session.expect(250);
        try {
            await session.send('QUIT', 221);
        } catch {
            // the message is already accepted
        }
    };

    try {
        await withTimeout(run(), timeoutMs, close);
    } finally {
        close();
    }
}
