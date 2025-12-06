/**
 * Text-to-Speech utilities using Web Speech API
 */

let currentUtterance: SpeechSynthesisUtterance | null = null;

/**
 * Check if TTS is available in the browser
 */
export function isTTSAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Speak text using TTS
 * @param text - Text to speak
 * @param options - Optional speech settings
 */
export function speak(text: string, options?: {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
}): void {
  if (!isTTSAvailable()) {
    console.warn('[TTS] SpeechSynthesis not available');
    return;
  }

  // Stop any current speech
  stop();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Apply options
  if (options?.rate !== undefined) utterance.rate = options.rate;
  if (options?.pitch !== undefined) utterance.pitch = options.pitch;
  if (options?.volume !== undefined) utterance.volume = options.volume;
  if (options?.lang) utterance.lang = options.lang;

  currentUtterance = utterance;
  
  // Clean up when finished
  utterance.onend = () => {
    currentUtterance = null;
  };

  utterance.onerror = (event) => {
    console.error('[TTS] Speech error:', event);
    currentUtterance = null;
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Stop current speech
 */
export function stop(): void {
  if (!isTTSAvailable()) return;

  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel();
  }
  
  currentUtterance = null;
}

/**
 * Check if TTS is currently speaking
 */
export function isSpeaking(): boolean {
  if (!isTTSAvailable()) return false;
  return window.speechSynthesis.speaking;
}

/**
 * Pause current speech
 */
export function pause(): void {
  if (!isTTSAvailable()) return;
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
  }
}

/**
 * Resume paused speech
 */
export function resume(): void {
  if (!isTTSAvailable()) return;
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }
}

/**
 * Get TTS preference from localStorage
 */
export function getTTSPreference(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('tts-enabled');
  return stored === 'true';
}

/**
 * Save TTS preference to localStorage
 */
export function setTTSPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('tts-enabled', enabled.toString());
}
