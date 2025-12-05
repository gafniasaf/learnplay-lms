
/**
 * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
 * Generated via scripts/compile-learnplay.js
 */
import React from "react";
import { Route } from "react-router-dom";
const Page0 = React.lazy(() => import("./pages/generated/pages/admin-ai-pipeline"));
const Page1 = React.lazy(() => import("./pages/generated/pages/admin-console"));
const Page2 = React.lazy(() => import("./pages/generated/pages/admin-jobs"));
const Page3 = React.lazy(() => import("./pages/generated/pages/admin-system-health"));
const Page4 = React.lazy(() => import("./pages/generated/pages/auth"));
const Page5 = React.lazy(() => import("./pages/generated/pages/catalog-builder-media"));
const Page6 = React.lazy(() => import("./pages/generated/pages/catalog-builder"));
const Page7 = React.lazy(() => import("./pages/generated/pages/landing"));
const Page8 = React.lazy(() => import("./pages/generated/pages/messages-inbox"));
const Page9 = React.lazy(() => import("./pages/generated/pages/parent-dashboard"));
const Page10 = React.lazy(() => import("./pages/generated/pages/parent-goals"));
const Page11 = React.lazy(() => import("./pages/generated/pages/parent-subjects"));
const Page12 = React.lazy(() => import("./pages/generated/pages/parent-timeline"));
const Page13 = React.lazy(() => import("./pages/generated/pages/play-results"));
const Page14 = React.lazy(() => import("./pages/generated/pages/play-session-media"));
const Page15 = React.lazy(() => import("./pages/generated/pages/play-session"));
const Page16 = React.lazy(() => import("./pages/generated/pages/play-welcome"));
const Page17 = React.lazy(() => import("./pages/generated/pages/settings"));
const Page18 = React.lazy(() => import("./pages/generated/pages/student-achievements"));
const Page19 = React.lazy(() => import("./pages/generated/pages/student-assignments"));
const Page20 = React.lazy(() => import("./pages/generated/pages/student-dashboard"));
const Page21 = React.lazy(() => import("./pages/generated/pages/student-goals"));
const Page22 = React.lazy(() => import("./pages/generated/pages/student-join-class"));
const Page23 = React.lazy(() => import("./pages/generated/pages/student-timeline"));
const Page24 = React.lazy(() => import("./pages/generated/pages/teacher-analytics"));
const Page25 = React.lazy(() => import("./pages/generated/pages/teacher-assignment-progress"));
const Page26 = React.lazy(() => import("./pages/generated/pages/teacher-assignments"));
const Page27 = React.lazy(() => import("./pages/generated/pages/teacher-class-progress"));
const Page28 = React.lazy(() => import("./pages/generated/pages/teacher-classes"));
const Page29 = React.lazy(() => import("./pages/generated/pages/teacher-control"));
const Page30 = React.lazy(() => import("./pages/generated/pages/teacher-dashboard"));
const Page31 = React.lazy(() => import("./pages/generated/pages/teacher-students"));
const Page32 = React.lazy(() => import("./pages/generated/pages/about"));

const generatedRouteCount = 33;

export const generatedRouteElements = [
  <Route key="gen-0" path="/admin/ai-pipeline" element={<Page0 />} />,
  <Route key="gen-1" path="/admin/console" element={<Page1 />} />,
  <Route key="gen-2" path="/admin/jobs" element={<Page2 />} />,
  <Route key="gen-3" path="/admin/system-health" element={<Page3 />} />,
  <Route key="gen-4" path="/auth" element={<Page4 />} />,
  <Route key="gen-5" path="/catalog-builder/media" element={<Page5 />} />,
  <Route key="gen-6" path="/catalog-builder" element={<Page6 />} />,
  <Route key="gen-7" path="/" element={<Page7 />} />,
  <Route key="gen-8" path="/messages" element={<Page8 />} />,
  <Route key="gen-9" path="/parent/dashboard" element={<Page9 />} />,
  <Route key="gen-10" path="/parent/goals" element={<Page10 />} />,
  <Route key="gen-11" path="/parent/subjects" element={<Page11 />} />,
  <Route key="gen-12" path="/parent/timeline" element={<Page12 />} />,
  <Route key="gen-13" path="/results" element={<Page13 />} />,
  <Route key="gen-14" path="/play/media" element={<Page14 />} />,
  <Route key="gen-15" path="/play" element={<Page15 />} />,
  <Route key="gen-16" path="/play/welcome" element={<Page16 />} />,
  <Route key="gen-17" path="/settings" element={<Page17 />} />,
  <Route key="gen-18" path="/student/achievements" element={<Page18 />} />,
  <Route key="gen-19" path="/student/assignments" element={<Page19 />} />,
  <Route key="gen-20" path="/student/dashboard" element={<Page20 />} />,
  <Route key="gen-21" path="/student/goals" element={<Page21 />} />,
  <Route key="gen-22" path="/student/join-class" element={<Page22 />} />,
  <Route key="gen-23" path="/student/timeline" element={<Page23 />} />,
  <Route key="gen-24" path="/teacher/analytics" element={<Page24 />} />,
  <Route key="gen-25" path="/teacher/assignment-progress" element={<Page25 />} />,
  <Route key="gen-26" path="/teacher/assignments" element={<Page26 />} />,
  <Route key="gen-27" path="/teacher/class-progress" element={<Page27 />} />,
  <Route key="gen-28" path="/teacher/classes" element={<Page28 />} />,
  <Route key="gen-29" path="/teacher/control" element={<Page29 />} />,
  <Route key="gen-30" path="/teacher/dashboard" element={<Page30 />} />,
  <Route key="gen-31" path="/teacher/students" element={<Page31 />} />,
  <Route key="gen-32" path="/about" element={<Page32 />} />,
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
