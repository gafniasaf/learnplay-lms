import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import { useLocation, useNavigationType, createRoutesFromChildren, matchRoutes } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";
import "./styles/generated.css";
import "./styles/learnplay.css";
import { initAuth } from "./lib/supabase";
import { validateEnv, isLiveMode } from "./lib/env";
import { assignAutoCTAs } from "./lib/ui/ctaAutoId";

// Force live mode when VITE_USE_MOCK='false' is set (clear stale localStorage)
if (import.meta.env.VITE_USE_MOCK === 'false') {
  try {
    localStorage.setItem('useMock', 'false');
    console.log('[Main] Forced live mode via VITE_USE_MOCK=false');
  } catch (e) {
    console.warn('[Main] Failed to set localStorage:', e);
  }
}

declare global {
  interface Window {
    __BYPASS_AUTH__?: boolean;
  }
}

// Validate environment variables before initialization
try {
  validateEnv();
} catch (error) {
  // Display error in DOM since app won't initialize
  document.body.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
      font-family: system-ui, -apple-system, sans-serif;
    ">
      <div style="
        max-width: 600px;
        padding: 2rem;
        border: 2px solid #dc2626;
        border-radius: 0.5rem;
        background: #fef2f2;
      ">
        <h1 style="color: #dc2626; margin-top: 0;">Configuration Error</h1>
        <p style="color: #991b1b; margin-bottom: 1rem;">
          The application is missing required environment variables.
        </p>
        <pre style="
          background: white;
          padding: 1rem;
          border-radius: 0.375rem;
          overflow: auto;
          font-size: 0.875rem;
          color: #dc2626;
        ">${error instanceof Error ? error.message : String(error)}</pre>
        <p style="color: #991b1b; margin-top: 1rem; font-size: 0.875rem;">
          Please check your environment configuration and try again.
        </p>
      </div>
    </div>
  `;
  throw error;
}

// Initialize Sentry if DSN is provided
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: 0.1, // Capture 10% of transactions
    // Session Replay
    replaysSessionSampleRate: 0.1, // Sample 10% of sessions
    replaysOnErrorSampleRate: 1.0, // Sample 100% of sessions with errors
    
    beforeSend(event, hint) {
      // Add route information
      if (window.location) {
        event.tags = {
          ...event.tags,
          route: window.location.pathname,
          url: window.location.href,
        };
      }
      
      // Add request ID if available in error context
      if (hint?.originalException && typeof hint.originalException === 'object') {
        const error = hint.originalException as any;
        if (error.requestId) {
          event.tags = {
            ...event.tags,
            request_id: error.requestId,
          };
        }
      }
      
      return event;
    },
  });

  console.log("Sentry initialized for error tracking");
} else {
  console.log("Sentry DSN not configured - error tracking disabled");
}

function bootstrapAuthBypassFlag() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const param = params.get("bypassAuth");
  if (param && ["1", "true"].includes(param.toLowerCase())) {
    window.__BYPASS_AUTH__ = true;
    try {
      window.localStorage.setItem("ignite:bypassAuth", "true");
    } catch {
      // ignore
    }
  } else if (param && ["0", "false"].includes(param.toLowerCase())) {
    window.__BYPASS_AUTH__ = false;
    try {
      window.localStorage.removeItem("ignite:bypassAuth");
    } catch {
      // ignore
    }
  } else if (!window.__BYPASS_AUTH__) {
    try {
      if (window.localStorage.getItem("ignite:bypassAuth") === "true") {
        window.__BYPASS_AUTH__ = true;
      }
    } catch {
      // ignore
    }
  }
}
bootstrapAuthBypassFlag();

// Define renderApp before using it
let appRendered = false;
function renderApp() {
  if (appRendered) return;
  appRendered = true;
  
  createRoot(document.getElementById("root")!).render(
    <Sentry.ErrorBoundary 
      fallback={({ error, resetError }) => {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return (
          <div style={{ 
            padding: '2rem', 
            maxWidth: '600px', 
            margin: '2rem auto',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            <h1 style={{ color: '#dc2626', marginBottom: '1rem' }}>Something went wrong</h1>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              An unexpected error occurred. The error has been logged and we'll look into it.
            </p>
            <pre style={{ 
              backgroundColor: '#f3f4f6', 
              padding: '1rem', 
              borderRadius: '0.5rem',
              overflow: 'auto',
              textAlign: 'left',
              fontSize: '0.875rem',
              marginBottom: '1.5rem'
            }}>
              {errorMessage}
            </pre>
            <button
              onClick={resetError}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '0.5rem 1.5rem',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500'
              }}
            >
              Try again
            </button>
          </div>
        );
      }}
      showDialog={false}
    >
      <App />
    </Sentry.ErrorBoundary>
  );
}

// Initialize anonymous auth before rendering app, but don't block rendering
// Skip auth initialization in mock mode
const shouldInitAuth = isLiveMode();

if (shouldInitAuth) {
  const initTimeout = setTimeout(() => {
    console.warn("[Auth] Auth initialization timed out, rendering app anyway");
    renderApp();
  }, 2000); // 2 second timeout

  initAuth()
    .then(() => {
      clearTimeout(initTimeout);
      renderApp();
    })
    .catch((error) => {
      console.error("[Auth] Auth initialization failed:", error);
      clearTimeout(initTimeout);
      renderApp();
    });
} else {
  console.log("[Auth] Mock mode detected, skipping auth initialization");
  renderApp();
}

// Auto-tag CTAs (buttons/links) with deterministic data-cta-id when missing.
// This ensures CTA enforcement and mock exports capture every visible CTA.
assignAutoCTAs();