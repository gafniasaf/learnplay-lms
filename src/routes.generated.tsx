
/**
 * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
 * Generated via scripts/compile-learnplay.js
 */
import React from "react";
import { Route } from "react-router-dom";
const Page0 = React.lazy(() => import("./pages/generated/pages/about"));
const Page1 = React.lazy(() => import("./pages/generated/pages/admin-ai-pipeline"));
const Page2 = React.lazy(() => import("./pages/generated/pages/admin-book-monitor"));
const Page3 = React.lazy(() => import("./pages/generated/pages/admin-console"));
const Page4 = React.lazy(() => import("./pages/generated/pages/admin-jobs"));
const Page5 = React.lazy(() => import("./pages/generated/pages/admin-system-health"));
const Page6 = React.lazy(() => import("./pages/generated/pages/auth"));
const Page7 = React.lazy(() => import("./pages/generated/pages/book-missing-images"));
const Page8 = React.lazy(() => import("./pages/generated/pages/catalog-builder-media"));
const Page9 = React.lazy(() => import("./pages/generated/pages/catalog-builder"));
const Page10 = React.lazy(() => import("./pages/generated/pages/dawn-captures-landing"));
const Page11 = React.lazy(() => import("./pages/generated/pages/landing"));
const Page12 = React.lazy(() => import("./pages/generated/pages/messages-inbox"));
const Page13 = React.lazy(() => import("./pages/generated/pages/parent-dashboard"));
const Page14 = React.lazy(() => import("./pages/generated/pages/parent-goals"));
const Page15 = React.lazy(() => import("./pages/generated/pages/parent-subjects"));
const Page16 = React.lazy(() => import("./pages/generated/pages/parent-timeline"));
const Page17 = React.lazy(() => import("./pages/generated/pages/play-results"));
const Page18 = React.lazy(() => import("./pages/generated/pages/play-session-media"));
const Page19 = React.lazy(() => import("./pages/generated/pages/play-session"));
const Page20 = React.lazy(() => import("./pages/generated/pages/play-welcome"));
const Page21 = React.lazy(() => import("./pages/generated/pages/settings"));
const Page22 = React.lazy(() => import("./pages/generated/pages/student-achievements"));
const Page23 = React.lazy(() => import("./pages/generated/pages/student-assignments"));
const Page24 = React.lazy(() => import("./pages/generated/pages/student-dashboard"));
const Page25 = React.lazy(() => import("./pages/generated/pages/student-goals"));
const Page26 = React.lazy(() => import("./pages/generated/pages/student-join-class"));
const Page27 = React.lazy(() => import("./pages/generated/pages/student-timeline"));

const generatedRouteCount = 28;

export const generatedRouteElements = [
  <Route key="gen-0" path="/about" element={<Page0 />} />,
  <Route key="gen-1" path="/admin/ai-pipeline" element={<Page1 />} />,
  <Route key="gen-2" path="/admin/book-monitor" element={<Page2 />} />,
  <Route key="gen-3" path="/admin/console" element={<Page3 />} />,
  <Route key="gen-4" path="/admin/jobs" element={<Page4 />} />,
  <Route key="gen-5" path="/admin/system-health" element={<Page5 />} />,
  <Route key="gen-6" path="/auth" element={<Page6 />} />,
  <Route key="gen-7" path="/admin/books/:bookId/runs/:runId" element={<Page7 />} />,
  <Route key="gen-8" path="/catalog-builder/media" element={<Page8 />} />,
  <Route key="gen-9" path="/catalog-builder" element={<Page9 />} />,
  <Route key="gen-10" path="/dawn-captures-landing-html" element={<Page10 />} />,
  <Route key="gen-11" path="/" element={<Page11 />} />,
  <Route key="gen-12" path="/messages" element={<Page12 />} />,
  <Route key="gen-13" path="/parent/dashboard" element={<Page13 />} />,
  <Route key="gen-14" path="/parent/goals" element={<Page14 />} />,
  <Route key="gen-15" path="/parent/subjects" element={<Page15 />} />,
  <Route key="gen-16" path="/parent/timeline" element={<Page16 />} />,
  <Route key="gen-17" path="/results" element={<Page17 />} />,
  <Route key="gen-18" path="/play/media" element={<Page18 />} />,
  <Route key="gen-19" path="/play" element={<Page19 />} />,
  <Route key="gen-20" path="/play/welcome" element={<Page20 />} />,
  <Route key="gen-21" path="/settings" element={<Page21 />} />,
  <Route key="gen-22" path="/student/achievements" element={<Page22 />} />,
  <Route key="gen-23" path="/student/assignments" element={<Page23 />} />,
  <Route key="gen-24" path="/student/dashboard" element={<Page24 />} />,
  <Route key="gen-25" path="/student/goals" element={<Page25 />} />,
  <Route key="gen-26" path="/student/join-class" element={<Page26 />} />,
  <Route key="gen-27" path="/student/timeline" element={<Page27 />} />,
];

export const GeneratedRoutes = () => {
  if (!generatedRouteCount) return null;
  return <>{generatedRouteElements}</>;
};

export const GeneratedFallback = () => {
  if (generatedRouteCount) return null;
  return (
    <div className="p-6 text-sm text-muted-foreground">
      No generated routes compiled. Run the Factory to generate mockup-driven pages.
    </div>
  );
};
