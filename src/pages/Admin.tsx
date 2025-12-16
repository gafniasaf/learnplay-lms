import { Navigate, useLocation } from "react-router-dom";

/**
 * Legacy route alias.
 *
 * The generated `/admin/console` page previously contained mock-only UI.
 * IgniteZero is live-only, so we redirect to the real admin experience.
 */
export default function Admin() {
  const location = useLocation();
  return <Navigate to={`/admin/ai-pipeline${location.search || ""}`} replace />;
}


