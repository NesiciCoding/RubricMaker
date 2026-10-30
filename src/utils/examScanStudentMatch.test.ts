import { describe, it, expect } from 'vitest';
import { matchStudentByName } from './examScanStudentMatch';

const roster = [
    { id: 's1', name: 'Zoë Jansen' },
    { id: 's2', name: 'Sam de Vries' },
    { id: 's3', name: 'Noor El Amrani' },
    { id: 's4', name: 'Jan Jansen' },
];

describe('matchStudentByName', () => {
    it('matches a full name ignoring case, accents and punctuation', () => {
        expect(matchStudentByName('Candidate: ZOE JANSEN', roster)).toBe('s1');
    });

    it('matches a unique surname when only that is readable', () => {
        expect(matchStudentByName('de Vries', roster)).toBe('s2');
    });

    it('refuses an ambiguous surname shared by two students', () => {
        expect(matchStudentByName('Jansen', roster)).toBeUndefined();
    });

    it('returns undefined when no roster name appears', () => {
        expect(matchStudentByName('Candidate: ______', roster)).toBeUndefined();
    });
});
