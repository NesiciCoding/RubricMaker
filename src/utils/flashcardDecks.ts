/**
 * Every shipped "untitled deck" label (src/locales/*.json -> flashcards.untitled_deck). A deck is named
 * with whatever label was active when it was created, which is not necessarily the language the deck
 * list later runs in, so the empty-deck prune recognises all of them rather than only the current one.
 * The FlashcardsPage test keeps this in sync with the locale files.
 */
export const UNTITLED_DECK_NAMES = new Set([
    'Untitled deck', // en
    'Paquet sans titre', // fr
    'Naamloze set', // nl
    'Unbenannter Stapel', // de
    'Mazo sin título', // es
]);
