import { describe, expect, it } from 'vitest';
import {
    digestTotal,
    escapeEmailHtml,
    renderDigestEmail,
    renderGradedEmail,
    renderMessageEmail,
    safeHttpUrl,
} from '../../supabase/functions/_shared/notificationEmails.ts';

describe('safeHttpUrl', () => {
    it('keeps http(s) links and drops everything else', () => {
        expect(safeHttpUrl('https://app.example.nl/#/portal/s1')).toBe('https://app.example.nl/#/portal/s1');
        expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
        expect(safeHttpUrl('not a url')).toBeNull();
        expect(safeHttpUrl(undefined)).toBeNull();
    });
});

describe('renderGradedEmail', () => {
    it('names the rubric and links to the portal in both languages', () => {
        const email = renderGradedEmail({
            studentName: 'Sam',
            teacherName: 'Mevr. de Vries',
            rubricName: 'Betoog',
            portalUrl: 'https://app.example.nl/#/portal/s1',
        });
        expect(email.subject).toBe('Nieuwe beoordeling / New grade: Betoog');
        expect(email.html).toContain('Mevr. de Vries heeft je werk voor &quot;Betoog&quot; beoordeeld.');
        expect(email.html).toContain('has graded your work for &quot;Betoog&quot;');
        expect(email.html).toContain('href="https://app.example.nl/#/portal/s1"');
        expect(email.text).toContain('Bekijk je beoordeling: https://app.example.nl/#/portal/s1');
        expect(email.text).toContain('Hi Sam,');
    });

    it('escapes teacher-supplied text and leaves out an unsafe link', () => {
        const email = renderGradedEmail({ rubricName: '<script>x</script>', portalUrl: 'javascript:alert(1)' });
        expect(email.html).not.toContain('<script>');
        expect(email.html).toContain('&lt;script&gt;');
        expect(email.html).not.toContain('href=');
        expect(email.text).toContain('Log in op RubricMaker');
    });

    it('keeps the subject on one line', () => {
        expect(renderGradedEmail({ rubricName: 'a\r\nBcc: x@y.nl' }).subject).not.toMatch(/[\r\n]/);
    });
});

describe('renderMessageEmail', () => {
    it('quotes a clipped preview and mentions the thread context', () => {
        const email = renderMessageEmail({
            contextLabel: 'Essay 3',
            bodyPreview: 'x'.repeat(400),
            portalUrl: 'https://app.example.nl/#/portal/s1',
        });
        expect(email.subject).toBe('Nieuw bericht / New message: Essay 3');
        expect(email.html).toContain('Je docent heeft je een bericht gestuurd over &quot;Essay 3&quot;.');
        expect(email.html).toContain(`${'x'.repeat(299)}…`);
        expect(email.html).not.toContain('x'.repeat(301));
        expect(email.text).toContain('Read and reply: https://app.example.nl/#/portal/s1');
    });

    it('works without context or preview', () => {
        const email = renderMessageEmail({ teacherName: 'Jan' });
        expect(email.subject).toBe('Nieuw bericht van je docent / New message from your teacher');
        expect(email.html).toContain('Jan sent you a message.');
        expect(email.html).not.toContain('<blockquote');
    });
});

describe('renderDigestEmail', () => {
    it('lists only the non-zero categories, with singular and plural wording', () => {
        const email = renderDigestEmail({
            teacherName: 'Jan',
            counts: { unreadMessages: 1, overdueGrading: 3, moderation: 0 },
            appUrl: 'https://app.example.nl/#/',
        });
        expect(email.html).toContain('<li>1 ongelezen bericht van leerlingen</li>');
        expect(email.html).toContain('<li>3 ingeleverde werken wachten op beoordeling</li>');
        expect(email.html).toContain('<li>1 unread student message</li>');
        expect(email.html).toContain('<li>3 handed-in pieces of work are waiting to be graded</li>');
        expect(email.html).not.toContain('moderat');
        expect(email.text).toContain('Open RubricMaker: https://app.example.nl/#/');
        expect(email.text).toContain('turn it off');
    });

    it('totals the counts', () => {
        expect(digestTotal({ moderation: 2, overdueGrading: 1 })).toBe(3);
        expect(digestTotal({})).toBe(0);
    });
});

describe('escapeEmailHtml', () => {
    it('escapes quotes so values are safe inside attributes', () => {
        expect(escapeEmailHtml(`"'&<>`)).toBe('&quot;&#39;&amp;&lt;&gt;');
    });
});
