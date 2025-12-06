/**
 * Embed mode detection and safe postMessage communication
 * 
 * Provides utilities for:
 * - Detecting if the app is running in embed mode (iframe or ?embed=1)
 * - Safe postMessage communication with origin validation
 * - Typed event system for parent-child communication
 */

type Allowed = string[]; // e.g. ["https://lms.example.com"]
let allowed: Allowed = [];

/**
 * Set the list of allowed parent origins for postMessage communication
 * @param list - Array of allowed origin URLs
 */
export function setAllowedOrigins(list: Allowed) {
  allowed = list;
}

/**
 * Check if the app is running in embed mode
 * @returns true only if ?embed=1 is explicitly present
 */
export function isEmbed(): boolean {
  const url = new URL(window.location.href);
  
  // Only embed mode if explicitly requested via ?embed=1
  return url.searchParams.get("embed") === "1";
}

/**
 * Check if the app is in course fullscreen mode
 * @returns true if on a course route (/play) or ?fullscreen=1
 */
export function isCourseFullscreen(): boolean {
  if (typeof window === 'undefined') return false;
  
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  
  return pathname.startsWith('/play') || searchParams.get('fullscreen') === '1';
}

/**
 * Check if an origin is in the allowed list
 * @param origin - Origin to check
 * @returns true if the origin is allowed
 */
function isAllowedOrigin(origin: string): boolean {
  if (!allowed.length) return true; // permissive by default; tighten via env
  return allowed.some(a => origin === a);
}

/**
 * Typed events for child→parent communication
 */
export type EmbedEvent =
  | { type: "ready"; payload?: { version: string } }
  | { type: "round:start"; payload: { courseId: string; roundId: string; assignmentId?: string } }
  | { type: "attempt"; payload: { roundId: string; itemId: number; correct: boolean; answerIndex?: number; clusterId?: string; variant?: "1"|"2"|"3" } }
  | { type: "round:end"; payload: { roundId: string; finalScore: number; mistakes: number; durationMs: number } }
  | { type: "resize"; payload: { height: number } }
  | { type: "exit"; payload: Record<string, never> }
  | { type: "error"; payload: { message: string } }
  | { type: "stats"; payload: { score: number; mistakes: number; level: number; itemsRemaining: number; elapsedSeconds: number } };

/**
 * Typed commands from parent→child
 */
export type HostCommand =
  | { type: "command"; payload: { action: "next" } }
  | { type: "command"; payload: { action: "quit" } }
  | { type: "command"; payload: { action: "focusOption"; index: number } }
  | { type: "command"; payload: { action: "getStats" } };

/**
 * Send a message to the parent window (host)
 * Only sends if running in embed mode
 * @param evt - Typed event to send
 */
export function postToHost(evt: EmbedEvent) {
  if (!isEmbed()) return;
  try {
    window.parent.postMessage(evt, "*");
  } catch (err) {
    console.warn("[Embed] Failed to post message to host:", err);
  }
}

/**
 * Listen for messages from the parent window (host)
 * Only processes messages from allowed origins
 * @param handler - Function to handle incoming messages
 */
export function listenHost(handler: (evt: MessageEvent<any>) => void) {
  window.addEventListener("message", (e) => {
    if (!isAllowedOrigin(e.origin)) {
      console.warn("[Embed] Rejected message from disallowed origin:", e.origin);
      return;
    }
    handler(e);
  });
}
