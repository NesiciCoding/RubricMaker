import { useState, useEffect, useRef, useCallback } from 'react';

export type TTSStatus = 'idle' | 'speaking' | 'paused' | 'unsupported';

interface UseTTSOptions {
    lang: string;
    rate?: number;
    pitch?: number;
}

export interface UseTTSReturn {
    status: TTSStatus;
    charIndex: number;
    totalChars: number;
    speak: (text: string) => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
}

const LANG_MAP: Record<string, string[]> = {
    en: ['en-US', 'en-GB', 'en-AU', 'en'],
    nl: ['nl-NL', 'nl-BE', 'nl'],
    de: ['de-DE', 'de-AT', 'de-CH', 'de'],
    es: ['es-ES', 'es-MX', 'es-US', 'es'],
    fr: ['fr-FR', 'fr-BE', 'fr-CH', 'fr'],
};

function pickVoice(lang: string): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;
    const baseLang = lang.split('-')[0];
    const candidates = LANG_MAP[baseLang] ?? LANG_MAP[lang] ?? [lang];
    for (const code of candidates) {
        const match = voices.find((v) => v.lang === code || v.lang.startsWith(code));
        if (match) return match;
    }
    return voices[0] ?? null;
}

export function htmlToPlainText(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('p,br,div,li,h1,h2,h3,h4,h5,h6').forEach((el) => {
        el.prepend(document.createTextNode(' '));
        el.append(document.createTextNode(' '));
    });
    return (div.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function isSupported(): boolean {
    return typeof window !== 'undefined' && !!window.speechSynthesis;
}

export function useTTS({ lang, rate = 1, pitch = 1 }: UseTTSOptions): UseTTSReturn {
    const [status, setStatus] = useState<TTSStatus>(() => (isSupported() ? 'idle' : 'unsupported'));
    const [charIndex, setCharIndex] = useState(0);
    const [totalChars, setTotalChars] = useState(0);
    const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
    // Reload available voices once they are populated (async on some browsers)
    const [, setVoicesLoaded] = useState(0);

    useEffect(() => {
        if (!isSupported()) return;
        const ss = window.speechSynthesis;
        const handler = () => setVoicesLoaded((n) => n + 1);
        ss.addEventListener('voiceschanged', handler);
        return () => ss.removeEventListener('voiceschanged', handler);
    }, []);

    useEffect(() => {
        const ss = isSupported() ? window.speechSynthesis : null;
        return () => { ss?.cancel(); };
    }, []);

    const speak = useCallback(
        (text: string) => {
            if (!isSupported()) return;
            window.speechSynthesis.cancel();

            const utter = new SpeechSynthesisUtterance(text);
            const voice = pickVoice(lang);
            if (voice) {
                utter.voice = voice;
                utter.lang = voice.lang;
            } else {
                utter.lang = lang;
            }
            utter.rate = rate;
            utter.pitch = pitch;

            utter.onstart = () => setStatus('speaking');
            utter.onend = () => {
                setStatus('idle');
                setCharIndex(0);
            };
            utter.onerror = () => {
                setStatus('idle');
                setCharIndex(0);
            };
            utter.onboundary = (e) => setCharIndex(e.charIndex);

            utterRef.current = utter;
            setTotalChars(text.length);
            setCharIndex(0);
            setStatus('speaking');
            window.speechSynthesis.speak(utter);
        },
        [lang, rate, pitch]
    );

    const pause = useCallback(() => {
        if (!isSupported()) return;
        window.speechSynthesis.pause();
        setStatus('paused');
    }, []);

    const resume = useCallback(() => {
        if (!isSupported()) return;
        window.speechSynthesis.resume();
        setStatus('speaking');
    }, []);

    const stop = useCallback(() => {
        if (!isSupported()) return;
        window.speechSynthesis.cancel();
        setStatus('idle');
        setCharIndex(0);
    }, []);

    return { status, charIndex, totalChars, speak, pause, resume, stop };
}
