// Cells that start with = + - @ (or a tab/CR) are executed as formulas by spreadsheet apps. Student names and
// comments are free text, so every CSV we generate asks Papa Parse to prefix such cells with an apostrophe.
// The pattern has no end anchor: Papa's default does not match a cell that contains a line break.
export const CSV_UNPARSE_OPTIONS = { escapeFormulae: /^[=+\-@\t\r]/ } as const;
