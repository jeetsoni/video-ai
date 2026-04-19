"use client";

import { useCallback, useRef, useState } from "react";

export interface UseVoicePreviewResult {
  playingVoiceId: string | null;
  errorVoiceId: string | null;
  play: (voiceId: string, previewUrl: string) => void;
  stop: () => void;
}

export function useVoicePreview(): UseVoicePreviewResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [errorVoiceId, setErrorVoiceId] = useState<string | null>(null);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlayingVoiceId(null);
  }, []);

  const play = useCallback(
    (voiceId: string, previewUrl: string) => {
      stop();
      setErrorVoiceId(null);

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      const audio = audioRef.current;

      audio.onended = () => {
        setPlayingVoiceId(null);
      };

      audio.onerror = () => {
        setPlayingVoiceId(null);
        setErrorVoiceId(voiceId);
      };

      audio.src = previewUrl;
      setPlayingVoiceId(voiceId);
      audio.play().catch(() => {
        setPlayingVoiceId(null);
        setErrorVoiceId(voiceId);
      });
    },
    [stop],
  );

  return { playingVoiceId, errorVoiceId, play, stop };
}
