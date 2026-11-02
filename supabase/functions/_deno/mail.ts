// Deno socket glue for ../_shared/smtp.ts. The edge-runtime container gets the same SMTP_* variables
// as the auth container (see deploy/supabase/docker-compose.override.yml).

import { sendMail, smtpConfigFromEnv, type MailMessage, type SmtpDialer } from '../_shared/smtp.ts';

const denoDialer: SmtpDialer = {
    connect: (hostname, port) => Deno.connect({ hostname, port }),
    connectTls: (hostname, port) => Deno.connectTls({ hostname, port }),
    startTls: (socket, hostname) => Deno.startTls(socket as Deno.TcpConn, { hostname }),
};

export type MailResult = { sent: true } | { sent: false; reason: 'smtp_not_configured' | 'send_failed' };

// Literal names, so scripts/stack-drift.py can list what the edge-runtime container lacks.
function readSmtpConfig() {
    const env: Record<string, string | undefined> = {
        SMTP_HOST: Deno.env.get('SMTP_HOST'),
        SMTP_PORT: Deno.env.get('SMTP_PORT'),
        SMTP_USER: Deno.env.get('SMTP_USER'),
        SMTP_PASS: Deno.env.get('SMTP_PASS'),
        SMTP_ADMIN_EMAIL: Deno.env.get('SMTP_ADMIN_EMAIL'),
        SMTP_SENDER_NAME: Deno.env.get('SMTP_SENDER_NAME'),
    };
    return smtpConfigFromEnv((name) => env[name]);
}

export function mailConfigured(): boolean {
    return readSmtpConfig() !== null;
}

export function appUrl(): string | null {
    const raw = Deno.env.get('APP_URL')?.trim();
    return raw ? raw.replace(/\/+$/, '') : null;
}

// Hash routes, because the app is served with base './' and no server-side routing.
export function appLink(path: string): string | null {
    const base = appUrl();
    return base ? `${base}/#${path}` : null;
}

export async function sendEmail(message: MailMessage): Promise<MailResult> {
    const config = readSmtpConfig();
    if (!config) return { sent: false, reason: 'smtp_not_configured' };
    try {
        await sendMail(config, message, denoDialer);
        return { sent: true };
    } catch (e) {
        console.error('[mail] send failed', e instanceof Error ? e.message : String(e));
        return { sent: false, reason: 'send_failed' };
    }
}
