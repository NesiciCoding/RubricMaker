export interface IcsEvent {
    uid: string;
    title: string;
    /** ISO-8601 datetime of the deadline */
    dueDate: string;
}

function toIcsDate(iso: string): string {
    return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function buildIcs(events: IcsEvent[]): string {
    const dtstamp = toIcsDate(new Date().toISOString());
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//RubricMaker//Assignment Deadlines//EN',
        ...events.flatMap((e) => [
            'BEGIN:VEVENT',
            `UID:${e.uid}`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART:${toIcsDate(e.dueDate)}`,
            `SUMMARY:${e.title.replace(/[\r\n]+/g, ' ')}`,
            'END:VEVENT',
        ]),
        'END:VCALENDAR',
    ];
    return lines.join('\r\n');
}
