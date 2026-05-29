import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API типы (не всегда есть в lib.dom)
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface UseSpeechRecognitionResult {
  supported: boolean;
  listening: boolean;
  /** Финализированный текст за всю сессию */
  finalTranscript: string;
  /** Текущая «черновая» гипотеза (ещё не финализирована) */
  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(lang = "ru-RU"): UseSpeechRecognitionResult {
  const [supported] = useState(() => !!getRecognitionCtor());
  const [listening, setListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Намеренно ли мы держим запись (для auto-restart, т.к. браузер часто сам останавливает)
  const wantListeningRef = useRef(false);

  const ensureRecognition = useCallback(() => {
    if (recRef.current) return recRef.current;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let interim = "";
      let finalChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) finalChunk += text;
        else interim += text;
      }
      if (finalChunk) {
        setFinalTranscript((prev) => (prev ? prev + " " : "") + finalChunk.trim());
      }
      setInterimTranscript(interim);
    };

    rec.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      setError(ev.error);
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        wantListeningRef.current = false;
        setListening(false);
      }
    };

    rec.onend = () => {
      // Браузер часто завершает сессию сам — перезапускаем, если пользователь ещё хочет писать
      if (wantListeningRef.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
        setInterimTranscript("");
      }
    };

    recRef.current = rec;
    return rec;
  }, [lang]);

  const start = useCallback(() => {
    const rec = ensureRecognition();
    if (!rec) return;
    setError(null);
    wantListeningRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() во время уже идущей сессии бросает — игнорируем
    }
  }, [ensureRecognition]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setListening(false);
    setInterimTranscript("");
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  const reset = useCallback(() => {
    setFinalTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  return { supported, listening, finalTranscript, interimTranscript, error, start, stop, reset };
}
