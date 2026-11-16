import { describe, expect, it } from 'vitest';
import { matchesSearch, normaliseForSearch } from './searchMatch';

describe('normaliseForSearch', () => {
    it('folds case and accents to one canonical form', () => {
        expect(normaliseForSearch('José')).toBe('jose');
        expect(normaliseForSearch('JOSÉ')).toBe('jose');
        expect(normaliseForSearch('Jose')).toBe('jose');
        expect(normaliseForSearch('Müller')).toBe('muller');
        expect(normaliseForSearch('Zoë')).toBe('zoe');
    });

    it('folds letters that do not decompose into a base plus a mark', () => {
        expect(normaliseForSearch('Søren')).toBe('soren');
        expect(normaliseForSearch('Straße')).toBe('strasse');
        expect(normaliseForSearch('Łukasz')).toBe('lukasz');
        expect(normaliseForSearch('Ægir')).toBe('aegir');
    });

    it('leaves scripts without Latin accents alone', () => {
        expect(normaliseForSearch('Фёдор')).toBe('федор');
        expect(normaliseForSearch('王小明')).toBe('王小明');
        expect(normaliseForSearch('ソレン')).toBe('ソレン');
    });
});

describe('matchesSearch', () => {
    it('matches a name typed without its accents', () => {
        expect(matchesSearch('Jose', 'José Alvarez')).toBe(true);
        expect(matchesSearch('muller', 'Anna Müller')).toBe(true);
        expect(matchesSearch('ZOE', 'Zoë Bakker')).toBe(true);
        expect(matchesSearch('Soren', 'Søren Kjær')).toBe(true);
    });

    it('ignores the order of the query tokens', () => {
        expect(matchesSearch('Okafor Amara', 'Amara Okafor')).toBe(true);
        expect(matchesSearch('Amara Okafor', 'Amara Okafor')).toBe(true);
        expect(matchesSearch('Amara', 'Ngozi Okafor')).toBe(false);
    });

    it('searches every field given, not just the first', () => {
        expect(matchesSearch('4a', 'Amara Okafor', 'Class 4A')).toBe(true);
        expect(matchesSearch('Amara 4a', 'Amara Okafor', 'Class 4A')).toBe(true);
        expect(matchesSearch('group 3', 'Amara Okafor', 'Class 4A', 'Group 3')).toBe(true);
        expect(matchesSearch('group 5', 'Amara Okafor', 'Class 4A', 'Group 3')).toBe(false);
    });

    it('matches everything for an empty or whitespace-only query', () => {
        expect(matchesSearch('', 'Amara Okafor')).toBe(true);
        expect(matchesSearch('   ', 'Amara Okafor')).toBe(true);
        expect(matchesSearch('\r\n\t ', 'Amara Okafor', 'Class 4A')).toBe(true);
    });

    it('ignores missing and empty fields', () => {
        expect(matchesSearch('amara', 'Amara Okafor', null, undefined, '')).toBe(true);
        expect(matchesSearch('amara')).toBe(false);
    });

    it('matches non-Latin text literally', () => {
        expect(matchesSearch('王', '王小明')).toBe(true);
        expect(matchesSearch('федор', 'Фёдор Достоевский')).toBe(true);
        expect(matchesSearch('火田', '王小明')).toBe(false);
    });

    it('does not match a name it should not', () => {
        expect(matchesSearch('bob', 'Alice')).toBe(false);
        expect(matchesSearch('ali', 'Alice')).toBe(true);
    });
});
