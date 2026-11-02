// Dutch + English bodies for the notification emails the edge functions send directly over SMTP
// (the sign-in emails are GoTrue's, in public/email-templates/). Every value that came from a
// teacher or the database is escaped before it reaches HTML.

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

export interface DigestCounts {
    moderation?: number;
    overdueGrading?: number;
    unreadMessages?: number;
}

const PREVIEW_MAX = 300;

export function escapeEmailHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function safeHttpUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch {
        return null;
    }
}

function oneLine(value: string | null | undefined, max = 120): string {
    return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clip(value: string, max: number): string {
    const trimmed = value.trim();
    return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

interface Section {
    heading: string;
    paragraphs: string[];
    quote?: string;
    bullets?: string[];
    button?: string;
    note?: string;
}

function renderHtml(nl: Section, en: Section, link: string | null): string {
    const p = (text: string) => `<p style="margin: 0 0 16px;">${text}</p>`;
    const section = (s: Section, lang: string, headingSize: string) =>
        [
            `<div lang="${lang}">`,
            `<h2 style="margin: 0 0 16px; font-size: ${headingSize};">${escapeEmailHtml(s.heading)}</h2>`,
            ...s.paragraphs.map((t) => p(escapeEmailHtml(t))),
            s.bullets?.length
                ? `<ul style="margin: 0 0 16px; padding-left: 20px;">${s.bullets.map((b) => `<li>${escapeEmailHtml(b)}</li>`).join('')}</ul>`
                : '',
            s.quote
                ? `<blockquote style="margin: 0 0 16px; padding: 8px 12px; border-left: 3px solid #d1d5db; color: #374151; white-space: pre-wrap;">${escapeEmailHtml(s.quote)}</blockquote>`
                : '',
            link && s.button
                ? `<p style="margin: 0 0 16px;"><a href="${escapeEmailHtml(link)}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;">${escapeEmailHtml(s.button)}</a></p>`
                : '',
            s.note
                ? `<p style="margin: 0 0 16px; color: #6b7280; font-size: 13px;">${escapeEmailHtml(s.note)}</p>`
                : '',
            '</div>',
        ].join('\n');
    return [
        '<!DOCTYPE html>',
        '<html lang="nl">',
        '<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>RubricMaker</title></head>',
        '<body style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1f2937; padding: 24px; max-width: 480px; margin: 0 auto;">',
        section(nl, 'nl', '22px'),
        '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />',
        section(en, 'en', '18px'),
        '<p style="margin: 24px 0 0; color: #9ca3af; font-size: 12px;">RubricMaker</p>',
        '</body>',
        '</html>',
        '',
    ].join('\n');
}

function renderText(nl: Section, en: Section, link: string | null): string {
    const section = (s: Section) =>
        [
            s.heading,
            '',
            ...s.paragraphs.flatMap((t) => [t, '']),
            ...(s.bullets?.length ? [...s.bullets.map((b) => `- ${b}`), ''] : []),
            ...(s.quote ? [s.quote.replace(/^/gm, '> '), ''] : []),
            ...(link && s.button ? [`${s.button}: ${link}`, ''] : []),
            ...(s.note ? [s.note, ''] : []),
        ].join('\n');
    return `${section(nl)}\n----\n\n${section(en)}`.trimEnd() + '\n';
}

function render(subject: string, nl: Section, en: Section, link: string | null): RenderedEmail {
    return { subject, html: renderHtml(nl, en, link), text: renderText(nl, en, link) };
}

function greeting(name: string, word: string): string {
    return name ? `${word} ${name},` : `${word},`;
}

export function renderGradedEmail(input: {
    studentName?: string | null;
    teacherName?: string | null;
    rubricName: string;
    portalUrl?: string | null;
}): RenderedEmail {
    const student = oneLine(input.studentName, 80);
    const teacher = oneLine(input.teacherName, 80);
    const rubric = oneLine(input.rubricName, 160);
    const link = safeHttpUrl(input.portalUrl);
    return render(
        `Nieuwe beoordeling / New grade: ${rubric}`,
        {
            heading: 'Je werk is beoordeeld',
            paragraphs: [
                greeting(student, 'Hoi'),
                `${teacher || 'Je docent'} heeft je werk voor "${rubric}" beoordeeld.`,
                link
                    ? 'Bekijk je cijfer en feedback in RubricMaker.'
                    : 'Log in op RubricMaker om je cijfer en feedback te bekijken.',
            ],
            button: 'Bekijk je beoordeling',
        },
        {
            heading: 'Your work has been graded',
            paragraphs: [
                greeting(student, 'Hi'),
                `${teacher || 'Your teacher'} has graded your work for "${rubric}".`,
                link
                    ? 'See your grade and feedback in RubricMaker.'
                    : 'Sign in to RubricMaker to see your grade and feedback.',
            ],
            button: 'View your grade',
        },
        link
    );
}

export function renderMessageEmail(input: {
    studentName?: string | null;
    teacherName?: string | null;
    contextLabel?: string | null;
    bodyPreview?: string | null;
    portalUrl?: string | null;
}): RenderedEmail {
    const student = oneLine(input.studentName, 80);
    const teacher = oneLine(input.teacherName, 80);
    const context = oneLine(input.contextLabel, 160);
    const preview = clip(input.bodyPreview ?? '', PREVIEW_MAX);
    const link = safeHttpUrl(input.portalUrl);
    return render(
        context
            ? `Nieuw bericht / New message: ${context}`
            : 'Nieuw bericht van je docent / New message from your teacher',
        {
            heading: 'Je hebt een nieuw bericht',
            paragraphs: [
                greeting(student, 'Hoi'),
                context
                    ? `${teacher || 'Je docent'} heeft je een bericht gestuurd over "${context}".`
                    : `${teacher || 'Je docent'} heeft je een bericht gestuurd.`,
            ],
            quote: preview || undefined,
            button: 'Lees en beantwoord',
        },
        {
            heading: 'You have a new message',
            paragraphs: [
                greeting(student, 'Hi'),
                context
                    ? `${teacher || 'Your teacher'} sent you a message about "${context}".`
                    : `${teacher || 'Your teacher'} sent you a message.`,
            ],
            quote: preview || undefined,
            button: 'Read and reply',
        },
        link
    );
}

export function digestTotal(counts: DigestCounts): number {
    return (counts.moderation ?? 0) + (counts.overdueGrading ?? 0) + (counts.unreadMessages ?? 0);
}

export function renderDigestEmail(input: {
    teacherName?: string | null;
    counts: DigestCounts;
    appUrl?: string | null;
}): RenderedEmail {
    const teacher = oneLine(input.teacherName, 80);
    const { moderation = 0, overdueGrading = 0, unreadMessages = 0 } = input.counts;
    const link = safeHttpUrl(input.appUrl);
    const nl: string[] = [];
    const en: string[] = [];
    if (unreadMessages > 0) {
        nl.push(`${unreadMessages} ongelezen ${unreadMessages === 1 ? 'bericht' : 'berichten'} van leerlingen`);
        en.push(`${unreadMessages} unread student ${unreadMessages === 1 ? 'message' : 'messages'}`);
    }
    if (overdueGrading > 0) {
        nl.push(
            `${overdueGrading} ingeleverd${overdueGrading === 1 ? ' werk wacht' : 'e werken wachten'} op beoordeling`
        );
        en.push(
            `${overdueGrading} handed-in ${overdueGrading === 1 ? 'piece of work is' : 'pieces of work are'} waiting to be graded`
        );
    }
    if (moderation > 0) {
        nl.push(`${moderation} ${moderation === 1 ? 'melding wacht' : 'meldingen wachten'} op moderatie`);
        en.push(`${moderation} ${moderation === 1 ? 'report is' : 'reports are'} waiting for moderation`);
    }
    return render(
        'Je RubricMaker-overzicht / Your RubricMaker digest',
        {
            heading: 'Wat er op je wacht',
            paragraphs: [greeting(teacher, 'Hoi'), 'Dit staat er voor je klaar in RubricMaker:'],
            bullets: nl,
            button: 'Open RubricMaker',
            note: 'Je ontvangt dit overzicht omdat je het hebt aangezet in Instellingen. Daar kun je het ook weer uitzetten.',
        },
        {
            heading: "What's waiting for you",
            paragraphs: [greeting(teacher, 'Hi'), "Here's what's waiting for you in RubricMaker:"],
            bullets: en,
            button: 'Open RubricMaker',
            note: 'You get this digest because you turned it on in Settings, where you can also turn it off.',
        },
        link
    );
}
