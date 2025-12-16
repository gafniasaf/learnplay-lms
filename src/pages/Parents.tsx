import { Navigate, useLocation } from "react-router-dom";

/**
 * Legacy route alias.
 *
 * IgniteZero is live-only; the old `/parents` mock dashboard is not supported.
 * Redirect to the real Parent Dashboard.
 */
export default function Parents() {
  const location = useLocation();
  return <Navigate to={`/parent/dashboard${location.search || ""}`} replace />;
}


