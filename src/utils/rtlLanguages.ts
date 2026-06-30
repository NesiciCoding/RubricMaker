const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

export function isRtlLanguage(lang: string | undefined): boolean {
    // ponytail: guards against settings.language being absent on a freshly-synced account
    if (!lang) return false;
    return RTL_LANGUAGES.includes(lang.split('-')[0].toLowerCase());
}
