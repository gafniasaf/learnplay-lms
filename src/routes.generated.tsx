
/**
 * Routes configuration - uses dawn-react-starter pages for UI parity.
 * All menu items from nav.ts are mapped to their corresponding pages.
 * 
 * Workspace routes follow IgniteZero Manifest-First pattern:
 * - /workspace/[entity-slug]/:id for entity editors
 * - Entity names derived from system-manifest.json
 */
import React from "react";
import { Route } from "react-router-dom";
import CourseSelector from "./pages/admin/CourseSelector";
import ExpertcollegeExerciseGenerationSelector from "./pages/admin/ExpertcollegeExerciseGenerationSelector";
import ExpertcollegeExerciseGenerationEditor from "./pages/admin/ExpertcollegeExerciseGenerationEditor";
import WysiwygExerciseEditorSelector from "./pages/admin/WysiwygExerciseEditorSelector";

// Workspace Entity Editors (Manifest-First pattern)
const LearnerProfileEditor = React.lazy(() => import("./pages/workspace/LearnerProfileEditor"));
const AssignmentEditor = React.lazy(() => import("./pages/workspace/AssignmentEditor"));
const CourseBlueprintEditor = React.lazy(() => import("./pages/workspace/CourseBlueprintEditor"));
const MessageThreadEditor = React.lazy(() => import("./pages/workspace/MessageThreadEditor"));
const JobTicketEditor = React.lazy(() => import("./pages/workspace/JobTicketEditor"));

// Landing page (custom with dawn design + CTAs)
const Landing = React.lazy(() => import("./pages/generated/pages/landing"));

// Main section pages
const About = React.lazy(() => import("./pages/About"));
const Courses = React.lazy(() => import("./pages/Courses"));
const Help = React.lazy(() => import("./pages/Help"));

// Auth
const AuthPage = React.lazy(() => import("./pages/Auth"));

// Admin pages
const AdminConsole = React.lazy(() => import("./pages/Admin"));
const AIPipeline = React.lazy(() => import("./pages/admin/AIPipelineV2"));
const CourseEditor = React.lazy(() => import("./pages/admin/CourseEditorV3"));
const WysiwygExerciseEditor = React.lazy(() => import("./pages/admin/WysiwygExerciseEditor"));
const BookStudioLibrary = React.lazy(() => import("./pages/admin/BookStudioLibrary"));
const BookStudioGenerate = React.lazy(() => import("./pages/admin/BookStudioGenerate"));
const BookStudioBookDetail = React.lazy(() => import("./pages/admin/BookStudioBookDetail"));
const BookStudioChapterEditor = React.lazy(() => import("./pages/admin/BookStudioChapterEditor"));
const BookStudioVersions = React.lazy(() => import("./pages/admin/BookStudioVersions"));
const BooksLibrary = React.lazy(() => import("./pages/admin/BooksLibrary"));
const BookDetail = React.lazy(() => import("./pages/admin/BookDetail"));
const BookVersionDetail = React.lazy(() => import("./pages/admin/BookVersionDetail"));
const BookRunDetail = React.lazy(() => import("./pages/admin/BookRunDetail"));
const BookMissingImages = React.lazy(() => import("./pages/admin/BookMissingImages"));
const BookMonitor = React.lazy(() => import("./pages/admin/BookMonitor"));
const BookOverlayEditor = React.lazy(() => import("./pages/admin/BookOverlayEditor"));
const CourseVersionHistory = React.lazy(() => import("./pages/admin/CourseVersionHistory"));
const JobsDashboard = React.lazy(() => import("./pages/admin/JobsDashboard"));
const Logs = React.lazy(() => import("./pages/admin/Logs"));
const MediaManager = React.lazy(() => import("./pages/admin/MediaManager"));
const PerformanceMonitoring = React.lazy(() => import("./pages/admin/PerformanceMonitoring"));
const SystemHealth = React.lazy(() => import("./pages/admin/SystemHealth"));
const TagManagement = React.lazy(() => import("./pages/admin/TagManagement"));
const TagApprovalQueue = React.lazy(() => import("./pages/admin/TagApprovalQueue"));

// Messages
const MessagesInbox = React.lazy(() => import("./pages/messages/Inbox"));

// Parent pages
const ParentDashboard = React.lazy(() => import("./pages/parent/Dashboard"));
const ParentGoals = React.lazy(() => import("./pages/parent/Goals"));
const ParentSubjects = React.lazy(() => import("./pages/parent/Subjects"));
const ParentTimeline = React.lazy(() => import("./pages/parent/Timeline"));
const ParentTopics = React.lazy(() => import("./pages/parent/Topics"));
const LinkChild = React.lazy(() => import("./pages/parent/LinkChild"));

// Play pages
const Play = React.lazy(() => import("./pages/Play"));
const PlayWelcome = React.lazy(() => import("./pages/PlayWelcome"));
const Results = React.lazy(() => import("./pages/Results"));

// Student pages
const StudentAchievements = React.lazy(() => import("./pages/student/Achievements"));
const StudentAssignments = React.lazy(() => import("./pages/student/Assignments"));
const StudentDashboard = React.lazy(() => import("./pages/student/Dashboard"));
const StudentGoals = React.lazy(() => import("./pages/student/Goals"));
const StudentJoinClass = React.lazy(() => import("./pages/student/JoinClass"));
const StudentTimeline = React.lazy(() => import("./pages/student/Timeline"));

// Teacher pages
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

const generatedRouteCount = 48;

export const generatedRouteElements = [
  // Landing
  <Route key="gen-landing" path="/" element={<Landing />} />,
  
  // Main section
  <Route key="gen-about" path="/about" element={<About />} />,
  <Route key="gen-courses" path="/courses" element={<Courses />} />,
  <Route key="gen-help" path="/help" element={<Help />} />,
  
  // Auth
  <Route key="gen-auth" path="/auth" element={<AuthPage />} />,
  
  // Admin (all from nav.ts)
  <Route key="gen-admin-console" path="/admin/console" element={<AdminConsole />} />,
  <Route key="gen-admin-pipeline" path="/admin/ai-pipeline" element={<AIPipeline />} />,
  <Route key="gen-admin-book-monitor" path="/admin/book-monitor" element={<BookMonitor />} />,
  <Route key="gen-admin-course-select" path="/admin/courses/select" element={<CourseSelector />} />,
  <Route key="gen-admin-book-studio" path="/admin/book-studio" element={<BookStudioLibrary />} />,
  <Route key="gen-admin-book-studio-generate" path="/admin/book-studio/generate" element={<BookStudioGenerate />} />,
  <Route key="gen-admin-book-studio-book" path="/admin/book-studio/:bookId" element={<BookStudioBookDetail />} />,
  <Route
    key="gen-admin-book-studio-chapter"
    path="/admin/book-studio/:bookId/chapters/:chapterIndex"
    element={<BookStudioChapterEditor />}
  />,
  <Route key="gen-admin-book-studio-versions" path="/admin/book-studio/:bookId/versions" element={<BookStudioVersions />} />,
  <Route key="gen-admin-books" path="/admin/books" element={<BooksLibrary />} />,
  <Route key="gen-admin-books-missing-images" path="/admin/books/missing-images" element={<BookMissingImages />} />,
  <Route key="gen-admin-book-detail" path="/admin/books/:bookId" element={<BookDetail />} />,
  <Route key="gen-admin-book-version" path="/admin/books/:bookId/versions/:bookVersionId" element={<BookVersionDetail />} />,
  <Route key="gen-admin-book-run" path="/admin/books/:bookId/runs/:runId" element={<BookRunDetail />} />,
  <Route
    key="gen-admin-book-overlay-editor"
    path="/admin/books/:bookId/versions/:bookVersionId/overlays/:overlayId"
    element={<BookOverlayEditor />}
  />,
  <Route key="gen-admin-editor" path="/admin/editor/:courseId" element={<CourseEditor />} />,
  <Route key="gen-admin-wysiwyg-select" path="/admin/wysiwyg-exercise-editor/select" element={<WysiwygExerciseEditorSelector />} />,
  <Route key="gen-admin-wysiwyg-editor" path="/admin/wysiwyg-exercise-editor/:courseId" element={<WysiwygExerciseEditor />} />,
  <Route
    key="gen-admin-expertcollege-select"
    path="/admin/expertcollege-exercise-generation/select"
    element={<ExpertcollegeExerciseGenerationSelector />}
  />,
  <Route
    key="gen-admin-expertcollege-editor"
    path="/admin/expertcollege-exercise-generation/:courseId"
    element={<ExpertcollegeExerciseGenerationEditor />}
  />,
  <Route key="gen-admin-versions" path="/admin/courses/:courseId/versions" element={<CourseVersionHistory />} />,
  <Route key="gen-admin-jobs" path="/admin/jobs" element={<JobsDashboard />} />,
  <Route key="gen-admin-logs" path="/admin/logs" element={<Logs />} />,
  <Route key="gen-admin-media" path="/admin/tools/media" element={<MediaManager />} />,
  <Route key="gen-admin-performance" path="/admin/performance" element={<PerformanceMonitoring />} />,
  <Route key="gen-admin-health" path="/admin/system-health" element={<SystemHealth />} />,
  <Route key="gen-admin-tags" path="/admin/tags" element={<TagManagement />} />,
  <Route key="gen-admin-tags-approve" path="/admin/tags/approve" element={<TagApprovalQueue />} />,
  
  // Messages
  <Route key="gen-messages" path="/messages" element={<MessagesInbox />} />,
  
  // Parent (all from nav.ts)
  <Route key="gen-parent-dash" path="/parent/dashboard" element={<ParentDashboard />} />,
  <Route key="gen-parent-subjects" path="/parent/subjects" element={<ParentSubjects />} />,
  <Route key="gen-parent-topics" path="/parent/topics" element={<ParentTopics />} />,
  <Route key="gen-parent-timeline" path="/parent/timeline" element={<ParentTimeline />} />,
  <Route key="gen-parent-goals" path="/parent/goals" element={<ParentGoals />} />,
  <Route key="gen-parent-link-child" path="/parent/link-child" element={<LinkChild />} />,
  
  // Play
  <Route key="gen-play" path="/play" element={<Play />} />,
  <Route key="gen-play-course" path="/play/:courseId" element={<Play />} />,
  <Route key="gen-play-welcome" path="/play/:courseId/welcome" element={<PlayWelcome />} />,
  <Route key="gen-play-media" path="/play/media" element={<PlayMedia />} />,
  <Route key="gen-results" path="/results" element={<Results />} />,
  
  // Settings
  <Route key="gen-settings" path="/settings" element={<Settings />} />,
  
  // Student (all from nav.ts)
  <Route key="gen-student-dash" path="/student/dashboard" element={<StudentDashboard />} />,
  <Route key="gen-student-assignments" path="/student/assignments" element={<StudentAssignments />} />,
  <Route key="gen-student-achievements" path="/student/achievements" element={<StudentAchievements />} />,
  <Route key="gen-student-goals" path="/student/goals" element={<StudentGoals />} />,
  <Route key="gen-student-timeline" path="/student/timeline" element={<StudentTimeline />} />,
  <Route key="gen-student-join" path="/student/join-class" element={<StudentJoinClass />} />,
  
  // Teacher (all from nav.ts)
  <Route key="gen-teacher-dash" path="/teacher/dashboard" element={<TeacherDashboard />} />,
  <Route key="gen-teacher-students" path="/teacher/students" element={<TeacherStudents />} />,
  <Route key="gen-teacher-classes" path="/teacher/classes" element={<TeacherClasses />} />,
  <Route key="gen-teacher-class-progress" path="/teacher/class-progress" element={<TeacherClassProgress />} />,
  <Route key="gen-teacher-assignments" path="/teacher/assignments" element={<TeacherAssignments />} />,
  <Route key="gen-teacher-assign-progress" path="/teacher/assignments/:id/progress" element={<TeacherAssignmentProgress />} />,
  <Route key="gen-teacher-analytics" path="/teacher/analytics" element={<TeacherAnalytics />} />,
  <Route key="gen-teacher-control" path="/teacher/control" element={<TeacherControl />} />,
  
  // Catalog Builder
  <Route key="gen-catalog" path="/catalog-builder" element={<CatalogBuilder />} />,
  <Route key="gen-catalog-media" path="/catalog-builder/media" element={<CatalogBuilderMedia />} />,
  
  // Workspace Entity Editors (Manifest-First pattern)
  // Routes follow pattern: /workspace/[entity-slug]/:id
  <Route key="ws-learner-profile" path="/workspace/learner-profile/:id" element={<LearnerProfileEditor />} />,
  <Route key="ws-assignment" path="/workspace/assignment/:id" element={<AssignmentEditor />} />,
  <Route key="ws-course-blueprint" path="/workspace/course-blueprint/:id" element={<CourseBlueprintEditor />} />,
  <Route key="ws-message-thread" path="/workspace/message-thread/:id" element={<MessageThreadEditor />} />,
  <Route key="ws-job-ticket" path="/workspace/job-ticket/:id" element={<JobTicketEditor />} />,
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
