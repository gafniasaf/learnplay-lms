import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, Component, ReactNode, useEffect, useMemo, useState } from "react";
import { generatedRouteElements, GeneratedFallback } from "./routes.generated";
import { useSentryUser } from "./hooks/useSentryUser";
import { DawnDataProvider } from "./contexts/DawnDataContext";
import { Layout } from "./components/layout/Layout";
import { isDevAgentMode } from "@/lib/api/common";
import { onDevChange } from "@/lib/env";
import AdminCourseSelectorPage from "./pages/admin/CourseSelector";

const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Kids = lazy(() => import("./pages/Kids"));
const Schools = lazy(() => import("./pages/Schools"));
const Parents = lazy(() => import("./pages/Parents"));
const EmbedThanks = lazy(() => import("./pages/embed/Thanks"));
const CrmDashboard = lazy(() => import("./pages/crm-demo/dashboard/Dashboard"));
const CrmContacts = lazy(() => import("./pages/crm-demo/contacts/ContactList"));
const GenericList = lazy(() => import("./pages/generic/GenericList"));
const GenericBoard = lazy(() => import("./pages/generic/GenericBoard"));
const AdminMetrics = lazy(() => import("./pages/admin/Metrics"));
// NOTE: Lovable hosted previews can intermittently fail `React.lazy()` dynamic imports (served as /src/*.tsx).
// Keep this route eagerly imported to avoid "Failed to fetch dynamically imported module" crashes.
const AdminCourseSelector = AdminCourseSelectorPage;
const AdminMediaManager = lazy(() => import("./pages/admin/MediaManager"));
const AdminTagApprovalQueue = lazy(() => import("./pages/admin/TagApprovalQueue"));
const AdminImportLegacyCourse = lazy(() => import("./pages/admin/ImportLegacyCourse"));
const AdminLibraryCourses = lazy(() => import("./pages/admin/LibraryCourses"));
const AdminLibraryCourseDetail = lazy(() => import("./pages/admin/LibraryCourseDetail"));
const TeacherAssignments = lazy(() => import("./pages/teacher/Assignments"));
const TeacherKw1cCockpit = lazy(() => import("./pages/teacher/Kw1cCockpit"));
const TeacherLessonKits = lazy(() => import("./pages/teacher/LessonKits"));
const TeacherMaterials = lazy(() => import("./pages/teacher/Materials"));
const TeacherStandards = lazy(() => import("./pages/teacher/Standards"));
const TeacherChat = lazy(() => import("./pages/teacher/TeacherChat"));
const TeacherMesRecommendations = lazy(() => import("./pages/teacher/MesRecommendations"));
const MessagesInbox = lazy(() => import("./pages/messages/Inbox"));
const Play = lazy(() => import("./pages/Play"));

const queryClient = new QueryClient();

// Error boundary to catch and display errors
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-600">
          <h1 className="text-xl font-bold mb-4">Something went wrong</h1>
          <pre className="bg-red-50 p-4 rounded overflow-auto text-sm">
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

// Component to set up Sentry user context
const SentryUserProvider = ({ children }: { children: React.ReactNode }) => {
  useSentryUser();
  return <>{children}</>;
};

function isLovableHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h.includes("lovable.app") || h.includes("lovableproject.com") || h.includes("lovable.dev");
}

const DevAgentSetupGate = ({ children }: { children: React.ReactNode }) => {
  const lovable = useMemo(() => isLovableHost(), []);
  // The DEV toggle lives deep in the UI (HamburgerMenu). Since state updates in descendants
  // don't re-render ancestors, we subscribe to dev-mode changes and bump a local counter to
  // recompute dev-agent gating immediately.
  const [gateVersion, setGateVersion] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const offDev = onDevChange(() => setGateVersion((v) => v + 1));
    const onInvalid = () => setGateVersion((v) => v + 1);
    window.addEventListener("iz:dev-agent-invalid", onInvalid as EventListener);
    return () => {
      offDev?.();
      window.removeEventListener("iz:dev-agent-invalid", onInvalid as EventListener);
    };
  }, []);

  const enabled = lovable && isDevAgentMode();
  const [agentToken, setAgentToken] = useState("");
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");

  // Allow "no-modal" setup via URL query params. This is useful in iframe preview environments
  // where input focus/typing can be flaky. Values are persisted to sessionStorage and then
  // removed from the URL immediately.
  useEffect(() => {
    // Important: parse URL params even if dev-agent is currently disabled for this tab.
    // If the user shares a Lovable link with agentToken/orgId, we should recover automatically.
    if (!lovable || typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const token =
        params.get("iz_dev_agent_token") ||
        params.get("devAgentToken") ||
        params.get("agentToken");
      const org =
        params.get("iz_dev_org_id") ||
        params.get("devOrgId") ||
        params.get("orgId");
      const user =
        params.get("iz_dev_user_id") ||
        params.get("devUserId") ||
        params.get("userId");

      if (!token && !org && !user) return;

      // Always cache in-memory for iframe environments where storage may be blocked.
      // This allows the app to use dev-agent auth immediately without requiring a reload.
      try {
        const g = globalThis as any;
        g.__izDevAgent = g.__izDevAgent || {};
        if (token) g.__izDevAgent.iz_dev_agent_token = token;
        if (org) g.__izDevAgent.iz_dev_org_id = org;
        if (user) g.__izDevAgent.iz_dev_user_id = user;
      } catch {
        // ignore
      }

      // Persist to BOTH storages (best-effort):
      // - sessionStorage: per-tab stability
      // - localStorage: survives refresh/new tab (if allowed in this iframe)
      const setBoth = (k: string, v: string) => {
        try {
          window.sessionStorage.setItem(k, v);
        } catch {
          // ignore
        }
        try {
          window.localStorage.setItem(k, v);
        } catch {
          // ignore
        }
      };
      if (token) setBoth("iz_dev_agent_token", token);
      if (org) setBoth("iz_dev_org_id", org);
      if (user) setBoth("iz_dev_user_id", user);

      // If the URL explicitly provides dev-agent credentials, re-enable dev-agent mode
      // for this tab (a previous "disable" click shouldn't brick the shared link).
      try {
        window.sessionStorage.removeItem("iz_dev_agent_disabled");
      } catch {
        // ignore
      }
      try {
        window.localStorage.removeItem("iz_dev_agent_disabled");
      } catch {
        // ignore
      }

      // Remove sensitive params from URL so they don't stick in history/referrer.
      ["iz_dev_agent_token", "devAgentToken", "agentToken", "iz_dev_org_id", "devOrgId", "orgId", "iz_dev_user_id", "devUserId", "userId"].forEach(
        (k) => params.delete(k)
      );
      const newQs = params.toString();
      const newUrl = `${window.location.pathname}${newQs ? `?${newQs}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", newUrl);

      // Force a re-render so missing-credential checks can see the newly cached values
      // (important for iframe environments where storage is flaky).
      setGateVersion((v) => v + 1);
    } catch {
      // ignore
    }
  }, [lovable]);

  const missing = useMemo(() => {
    if (!enabled || typeof window === "undefined") return false;

    const invalidFlag = (() => {
      try {
        const g = globalThis as any;
        if (g.__izDevAgentInvalid === true) return true;
      } catch {
        // ignore
      }
      try {
        return window.sessionStorage.getItem("iz_dev_agent_invalid") === "1";
      } catch {
        return false;
      }
    })();

    const get = (k: string): string | null => {
      // In-memory cache (for iframe environments where storage is blocked)
      try {
        const mem = (globalThis as any).__izDevAgent as Record<string, unknown> | undefined;
        const v = mem?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      } catch {
        // ignore
      }

      try {
        const v = window.sessionStorage.getItem(k) || window.localStorage.getItem(k);
        if (v && v.trim()) return v.trim();
      } catch {
        // ignore
      }

      // Final fallback: allow URL params (some previews block storage entirely).
      try {
        const params = new URLSearchParams(window.location.search);
        if (k === "iz_dev_agent_token") {
          const token = params.get("iz_dev_agent_token") || params.get("devAgentToken") || params.get("agentToken");
          if (token?.trim()) return token.trim();
        }
        if (k === "iz_dev_org_id") {
          const orgId = params.get("iz_dev_org_id") || params.get("devOrgId") || params.get("orgId");
          if (orgId?.trim()) return orgId.trim();
        }
        if (k === "iz_dev_user_id") {
          const userId = params.get("iz_dev_user_id") || params.get("devUserId") || params.get("userId");
          if (userId?.trim()) return userId.trim();
        }
      } catch {
        // ignore
      }

      return null;
    };
    const normalize = (key: string, value: string | null): string | null => {
      const v = value?.trim() ?? "";
      if (!v) return null;
      // Common placeholder values that should NOT be treated as configured.
      const lowered = v.toLowerCase();
      if (v === "..." || v === "<token>" || v === "<org_uuid>" || v === "AGENT_TOKEN") return null;
      if (lowered === "null" || lowered === "undefined") return null;
      if (key === "iz_dev_org_id") {
        // Basic UUID check (keep strict to prevent "almost org id" mistakes).
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRe.test(v)) return null;
      }
      // Agent token: require a minimally plausible length to avoid accidental placeholders.
      if (key === "iz_dev_agent_token" && v.length < 12) return null;
      return v;
    };

    const token = normalize("iz_dev_agent_token", get("iz_dev_agent_token"));
    const org = normalize("iz_dev_org_id", get("iz_dev_org_id"));

    // user id is optional (auto-generated in dev-agent mode)
    return invalidFlag || !token || !org;
  }, [enabled, gateVersion]);

  if (!enabled || !missing) return <>{children}</>;

  const showInvalidHint = (() => {
    try {
      const g = globalThis as any;
      if (g.__izDevAgentInvalid === true) return true;
    } catch {
      // ignore
    }
    try {
      return window.sessionStorage.getItem("iz_dev_agent_invalid") === "1";
    } catch {
      return false;
    }
  })();

  return (
    <div className="min-h-screen">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-lg border bg-background shadow-lg">
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">Dev Agent Setup (Preview)</h2>
            <p className="text-sm text-muted-foreground">
              Lovable preview runs in an iframe where Supabase auth persistence can be unreliable. To keep you unblocked,
              paste your dev-agent credentials (stored in <code>sessionStorage</code> for this tab).
            </p>
            {showInvalidHint && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                Existing dev-agent credentials were rejected (401). Please paste the correct <code>AGENT_TOKEN</code> and org id.
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Agent token</label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={agentToken}
                onChange={(e) => setAgentToken(e.target.value)}
                placeholder="AGENT_TOKEN"
                autoComplete="off"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Organization ID</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  placeholder="org UUID"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">User ID (optional)</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="leave blank to auto-generate"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between pt-2">
              <button
                data-cta-id="cta-dev-agent-disable"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => {
                  try {
                    window.sessionStorage.setItem("iz_dev_agent_disabled", "1");
                  } catch {
                    // ignore
                  }
                  window.location.reload();
                }}
              >
                Use normal auth (disable for this tab)
              </button>

              <div className="flex gap-2">
                <button
                  data-cta-id="cta-dev-agent-refresh"
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={() => window.location.reload()}
                >
                  Refresh
                </button>
                <button
                  data-cta-id="cta-dev-agent-save-reload"
                  className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm"
                  onClick={() => {
                    try {
                      window.sessionStorage.removeItem("iz_dev_agent_disabled");
                      window.sessionStorage.removeItem("iz_dev_agent_invalid");
                      window.sessionStorage.setItem("iz_dev_agent_token", agentToken.trim());
                      window.sessionStorage.setItem("iz_dev_org_id", orgId.trim());
                      // user id is optional; if omitted it will be generated automatically.
                      if (userId.trim()) {
                        window.sessionStorage.setItem("iz_dev_user_id", userId.trim());
                      }
                    } catch {
                      // ignore
                    }
                    window.location.reload();
                  }}
                  disabled={!agentToken.trim() || !orgId.trim()}
                >
                  Save + Reload
                </button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Tip: you can also set these in DevTools console:
              <br />
              <code>
                sessionStorage.setItem('iz_dev_agent_token','...'); sessionStorage.setItem('iz_dev_org_id','...');
                sessionStorage.setItem('iz_dev_user_id','...'); location.reload();
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const useHashRouter = useMemo(() => isLovableHost(), []);
  const Router = useHashRouter ? HashRouter : BrowserRouter;

  // Lovable preview can intermittently fail to load deep links directly (e.g. HTTP 412).
  // Using hash routing in Lovable-hosted previews avoids server-side routing constraints.
  useEffect(() => {
    if (!useHashRouter || typeof window === "undefined") return;
    if (window.location.hash) return;
    const path = window.location.pathname || "/";
    if (path === "/" || path === "") return;
    const next = `/#${path}${window.location.search || ""}`;
    window.location.replace(next);
  }, [useHashRouter]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <DawnDataProvider>
            <Toaster />
            <Sonner />
            <Router>
              <SentryUserProvider>
                <DevAgentSetupGate>
                  <Layout>
                  <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
                    <Routes>
                      <Route path="/admin" element={<Navigate to="/admin/book-monitor" replace />} />
                      {/* Legacy DAWR route aliases (parity redirects) */}
                      <Route path="/admin/courses" element={<AdminCourseSelector />} />
                      <Route path="/admin/course-versions" element={<AdminCourseSelector />} />
                      <Route path="/admin/media-manager" element={<AdminMediaManager />} />
                      <Route path="/admin/tag-approval" element={<AdminTagApprovalQueue />} />
                      <Route path="/admin/import-legacy" element={<AdminImportLegacyCourse />} />
                      <Route path="/admin/metrics" element={<AdminMetrics />} />
                      <Route path="/admin/library-courses" element={<AdminLibraryCourses />} />
                      <Route path="/admin/library-courses/:courseId" element={<AdminLibraryCourseDetail />} />
                      <Route path="/teacher/assignment-progress" element={<TeacherAssignments />} />
                      <Route path="/teacher/kw1c-cockpit" element={<TeacherKw1cCockpit />} />
                      <Route path="/teacher/lesson-kits" element={<TeacherLessonKits />} />
                      <Route path="/teacher/materials" element={<TeacherMaterials />} />
                      <Route path="/teacher/standards" element={<TeacherStandards />} />
                      <Route path="/teacher/teachergpt/chat" element={<TeacherChat />} />
                      <Route path="/teacher/teachergpt/mes" element={<TeacherMesRecommendations />} />
                      <Route path="/play/welcome" element={<Play />} />
                      <Route path="/messages/inbox" element={<MessagesInbox />} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/auth/reset-password" element={<ResetPassword />} />
                      <Route path="/kids" element={<Kids />} />
                      <Route path="/schools" element={<Schools />} />
                      <Route path="/parents" element={<Parents />} />
                      <Route path="/embed/thanks" element={<EmbedThanks />} />
                      <Route path="/crm/dashboard" element={<CrmDashboard />} />
                      <Route path="/teacher" element={<Navigate to="/teacher/dashboard" replace />} />
                      <Route path="/crm/contacts" element={<CrmContacts />} />
                      <Route path="/demo/generic" element={<GenericList />} />
                      <Route path="/demo/generic/board" element={<GenericBoard />} />
                      {generatedRouteElements}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                    <GeneratedFallback />
                  </Suspense>
                  </Layout>
                </DevAgentSetupGate>
              </SentryUserProvider>
            </Router>
          </DawnDataProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
