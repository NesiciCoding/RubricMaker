const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

export function isRtlLanguage(lang: string): boolean {
    return RTL_LANGUAGES.includes(lang.split('-')[0].toLowerCase());
}
