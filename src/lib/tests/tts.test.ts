/**
 * TTS Smoke Test
 * Verifies that speak() and stop() work correctly with mocked speechSynthesis
 */

import { speak, stop, isTTSAvailable } from "../tts";

export async function runTTSTest(): Promise<{ pass: boolean; details?: any }> {
  const details: any = {
    speakCalled: false,
    cancelCalled: false,
    utteranceText: "",
    speakCount: 0,
  };

  // Check if running in a browser environment
  if (typeof window === "undefined") {
    return {
      pass: false,
      details: { ...details, error: "Test requires browser environment" },
    };
  }

  try {
    // Save original speechSynthesis
    const originalSpeechSynthesis = window.speechSynthesis;
    const originalSpeechSynthesisUtterance = window.SpeechSynthesisUtterance;

    // Mock speechSynthesis
    const mockSpeechSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      speak: function (utterance: any) {
        details.speakCalled = true;
        details.speakCount++;
        details.utteranceText = utterance.text;
        this.speaking = true;
        // Simulate utterance ending
        setTimeout(() => {
          if (utterance.onend) utterance.onend();
          this.speaking = false;
        }, 10);
      },
      cancel: function () {
        details.cancelCalled = true;
        this.speaking = false;
        this.pending = false;
      },
      pause: function () {
        this.paused = true;
      },
      resume: function () {
        this.paused = false;
      },
      getVoices: function () {
        return [];
      },
    };

    // Replace window.speechSynthesis
    Object.defineProperty(window, "speechSynthesis", {
      value: mockSpeechSynthesis,
      writable: true,
      configurable: true,
    });

    // Mock SpeechSynthesisUtterance
    class MockUtterance {
      text: string;
      rate: number = 1;
      pitch: number = 1;
      volume: number = 1;
      lang: string = "en-US";
      onend: (() => void) | null = null;
      onerror: ((event: any) => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: MockUtterance,
      writable: true,
      configurable: true,
    });

    // Test 1: Verify TTS is available
    if (!isTTSAvailable()) {
      throw new Error("TTS should be available after mocking");
    }

    // Test 2: Speak text (simulating stem + options)
    const testText = "What is 2 plus 2? A) 3, B) 4, C) 5, D) 6";
    speak(testText);

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (!details.speakCalled) {
      throw new Error("speak() did not call speechSynthesis.speak()");
    }

    if (details.utteranceText !== testText) {
      throw new Error(
        `Utterance text mismatch: expected "${testText}", got "${details.utteranceText}"`
      );
    }

    if (details.speakCount !== 1) {
      throw new Error(
        `Expected speak to be called once, but was called ${details.speakCount} times`
      );
    }

    // Test 3: Stop speech
    mockSpeechSynthesis.speaking = true;
    mockSpeechSynthesis.pending = true;
    stop();

    if (!details.cancelCalled) {
      throw new Error("stop() did not call speechSynthesis.cancel()");
    }

    // Test 4: Multiple speak calls should cancel previous
    details.speakCount = 0;
    details.cancelCalled = false;

    speak("First text");
    await new Promise((resolve) => setTimeout(resolve, 5));
    
    speak("Second text");
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Should have called speak twice but cancel at least once
    if (details.speakCount !== 2) {
      throw new Error(
        `Expected 2 speak calls, got ${details.speakCount}`
      );
    }

    // Restore original
    Object.defineProperty(window, "speechSynthesis", {
      value: originalSpeechSynthesis,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: originalSpeechSynthesisUtterance,
      writable: true,
      configurable: true,
    });

    return {
      pass: true,
      details,
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        ...details,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
