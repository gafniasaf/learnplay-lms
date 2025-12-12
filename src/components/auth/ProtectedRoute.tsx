import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const runtimeBypass =
    typeof window !== "undefined" &&
    Boolean((window as typeof window & { __BYPASS_AUTH__?: boolean }).__BYPASS_AUTH__);

  // Dev-only bypass mode for development velocity. MUST be explicitly enabled.
  const devAgentMode = import.meta.env.VITE_DEV_AGENT_MODE === "true";
  const bypassAuth =
    devAgentMode ||
    runtimeBypass ||
    (import.meta.env.VITE_BYPASS_AUTH === "true" && !import.meta.env.PROD);
  if (bypassAuth) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
        <div className="flex items-center gap-3 text-sm font-mono">
          <Loader2 className="h-4 w-4 animate-spin" />
          Authenticating…
        </div>
      </div>
    );
  }

  if (!user || user.is_anonymous) {
    return (
      <Navigate
        to="/auth"
        replace
        state={{ redirectTo: location.pathname + location.search }}
      />
    );
  }

  return <>{children}</>;
};


