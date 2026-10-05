// Cells that start with = + - @ are executed as formulas by spreadsheet apps. Student names and comments are
// free text, so every CSV we generate asks Papa Parse to prefix such cells with an apostrophe.
export const CSV_UNPARSE_OPTIONS = { escapeFormulae: true } as const;
