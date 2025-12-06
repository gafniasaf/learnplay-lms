
/**
 * Routes configuration - uses dawn-react-starter pages for UI parity.
 * Landing page is custom (matches dawn Home.tsx design with CTA IDs).
 */
import React from "react";
import { Route } from "react-router-dom";

// Landing page (custom with dawn design + CTAs)
const Landing = React.lazy(() => import("./pages/generated/pages/landing"));

// Dawn pages
const About = React.lazy(() => import("./pages/About"));
const AIPipeline = React.lazy(() => import("./pages/admin/AIPipeline"));
const AdminConsole = React.lazy(() => import("./pages/Admin"));
const JobsDashboard = React.lazy(() => import("./pages/admin/JobsDashboard"));
const SystemHealth = React.lazy(() => import("./pages/admin/SystemHealth"));
const AuthPage = React.lazy(() => import("./pages/Auth"));
const MessagesInbox = React.lazy(() => import("./pages/messages/Inbox"));
const ParentDashboard = React.lazy(() => import("./pages/parent/Dashboard"));
const ParentGoals = React.lazy(() => import("./pages/parent/Goals"));
const ParentSubjects = React.lazy(() => import("./pages/parent/Subjects"));
const ParentTimeline = React.lazy(() => import("./pages/parent/Timeline"));
const Results = React.lazy(() => import("./pages/Results"));
const Play = React.lazy(() => import("./pages/Play"));
const PlayWelcome = React.lazy(() => import("./pages/PlayWelcome"));
const StudentAchievements = React.lazy(() => import("./pages/student/Achievements"));
const StudentAssignments = React.lazy(() => import("./pages/student/Assignments"));
const StudentDashboard = React.lazy(() => import("./pages/student/Dashboard"));
const StudentGoals = React.lazy(() => import("./pages/student/Goals"));
const StudentJoinClass = React.lazy(() => import("./pages/student/JoinClass"));
const StudentTimeline = React.lazy(() => import("./pages/student/Timeline"));
const TeacherAnalytics = React.lazy(() => import("./pages/teacher/Analytics"));
const TeacherAssignmentProgress = React.lazy(() => import("./pages/teacher/AssignmentProgress"));
const TeacherAssignments = React.lazy(() => import("./pages/teacher/Assignments"));
const TeacherClassProgress = React.lazy(() => import("./pages/teacher/ClassProgress"));
const TeacherClasses = React.lazy(() => import("./pages/teacher/Classes"));
const TeacherDashboard = React.lazy(() => import("./pages/teacher/TeacherDashboard"));
const TeacherStudents = React.lazy(() => import("./pages/teacher/Students"));

// Generated pages (no dawn equivalent)
const CatalogBuilderMedia = React.lazy(() => import("./pages/generated/pages/catalog-builder-media"));
const CatalogBuilder = React.lazy(() => import("./pages/generated/pages/catalog-builder"));
const PlayMedia = React.lazy(() => import("./pages/generated/pages/play-session-media"));
const Settings = React.lazy(() => import("./pages/generated/pages/settings"));
const TeacherControl = React.lazy(() => import("./pages/generated/pages/teacher-control"));

const generatedRouteCount = 33;

export const generatedRouteElements = [
  // Landing
  <Route key="gen-landing" path="/" element={<Landing />} />,
  
  // Admin
  <Route key="gen-admin-pipeline" path="/admin/ai-pipeline" element={<AIPipeline />} />,
  <Route key="gen-admin-console" path="/admin/console" element={<AdminConsole />} />,
  <Route key="gen-admin-jobs" path="/admin/jobs" element={<JobsDashboard />} />,
  <Route key="gen-admin-health" path="/admin/system-health" element={<SystemHealth />} />,
  
  // Auth
  <Route key="gen-auth" path="/auth" element={<AuthPage />} />,
  
  // Catalog
  <Route key="gen-catalog-media" path="/catalog-builder/media" element={<CatalogBuilderMedia />} />,
  <Route key="gen-catalog" path="/catalog-builder" element={<CatalogBuilder />} />,
  
  // Messages
  <Route key="gen-messages" path="/messages" element={<MessagesInbox />} />,
  
  // Parent
  <Route key="gen-parent-dash" path="/parent/dashboard" element={<ParentDashboard />} />,
  <Route key="gen-parent-goals" path="/parent/goals" element={<ParentGoals />} />,
  <Route key="gen-parent-subjects" path="/parent/subjects" element={<ParentSubjects />} />,
  <Route key="gen-parent-timeline" path="/parent/timeline" element={<ParentTimeline />} />,
  
  // Play
  <Route key="gen-play" path="/play" element={<Play />} />,
  <Route key="gen-play-welcome" path="/play/welcome" element={<PlayWelcome />} />,
  <Route key="gen-play-media" path="/play/media" element={<PlayMedia />} />,
  <Route key="gen-results" path="/results" element={<Results />} />,
  
  // Settings
  <Route key="gen-settings" path="/settings" element={<Settings />} />,
  
  // Student
  <Route key="gen-student-achievements" path="/student/achievements" element={<StudentAchievements />} />,
  <Route key="gen-student-assignments" path="/student/assignments" element={<StudentAssignments />} />,
  <Route key="gen-student-dash" path="/student/dashboard" element={<StudentDashboard />} />,
  <Route key="gen-student-goals" path="/student/goals" element={<StudentGoals />} />,
  <Route key="gen-student-join" path="/student/join-class" element={<StudentJoinClass />} />,
  <Route key="gen-student-timeline" path="/student/timeline" element={<StudentTimeline />} />,
  
  // Teacher
  <Route key="gen-teacher-analytics" path="/teacher/analytics" element={<TeacherAnalytics />} />,
  <Route key="gen-teacher-assign-progress" path="/teacher/assignment-progress" element={<TeacherAssignmentProgress />} />,
  <Route key="gen-teacher-assignments" path="/teacher/assignments" element={<TeacherAssignments />} />,
  <Route key="gen-teacher-class-progress" path="/teacher/class-progress" element={<TeacherClassProgress />} />,
  <Route key="gen-teacher-classes" path="/teacher/classes" element={<TeacherClasses />} />,
  <Route key="gen-teacher-control" path="/teacher/control" element={<TeacherControl />} />,
  <Route key="gen-teacher-dash" path="/teacher/dashboard" element={<TeacherDashboard />} />,
  <Route key="gen-teacher-students" path="/teacher/students" element={<TeacherStudents />} />,
  
  // About
  <Route key="gen-about" path="/about" element={<About />} />,
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
