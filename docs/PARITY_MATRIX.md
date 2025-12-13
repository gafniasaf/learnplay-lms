# Systemwide Parity Matrix (legacy → current)

- Generated: **2025-12-13T03:41:53.152Z**
- Legacy root: `dawn-react-starter`
- Current root: `.`

## Summary

- **pages**: 85 total — ✅ 5, 🟡 49, ❌ 10, ➕ 21
- **components**: 195 total — ✅ 111, 🟡 75, ❌ 0, ➕ 9
- **hooks**: 42 total — ✅ 10, 🟡 23, ❌ 0, ➕ 9
- **lib_api**: 28 total — ✅ 11, 🟡 15, ❌ 0, ➕ 2
- **supabase_edge_functions**: 243 total — ✅ 19, 🟡 91, ❌ 86, ➕ 47
- **tests**: 205 total — ✅ 0, 🟡 1, ❌ 34, ➕ 170
- **scripts**: 152 total — ✅ 13, 🟡 15, ❌ 15, ➕ 109
- **config**: 1 total — ✅ 0, 🟡 1, ❌ 0, ➕ 0

## Route parity (nav/router extracted)

- **routes**: 🟡 (legacy: 49, current: 62, missing in current: 4, new in current: 17)

### Routes missing in current

- `/dev/diagnostics`
- `/docs/integration`
- `/e2e/option-fit`
- `/student`

### New routes in current

- `/admin/console`
- `/catalog-builder`
- `/catalog-builder/media`
- `/crm/contacts`
- `/crm/dashboard`
- `/demo/generic`
- `/demo/generic/board`
- `/play`
- `/play/media`
- `/settings`
- `/teacher/control`
- `/teacher/dashboard`
- `/workspace/assignment/:id`
- `/workspace/course-blueprint/:id`
- `/workspace/job-ticket/:id`
- `/workspace/learner-profile/:id`
- `/workspace/message-thread/:id`

## Edge function parity (directory-level)

- **supabase/functions/**: 🟡 (legacy: 121, current: 87, missing in current: 59, new in current: 25)

### Edge functions missing in current (legacy had these)

- `admin-create-tag`
- `admin-wipe`
- `agent-publish-course`
- `ai-recommend-assignment`
- `ai-rewrite-text`
- `assign-assignees`
- `assignment-metadata`
- `check-assignment-completion`
- `create-assignment`
- `debug-catalog`
- `debug-storage`
- `enqueue-marketing-job`
- `enqueue-media-job`
- `export-analytics`
- `export-gradebook`
- `game-end-round`
- `generate-assignment`
- `generate-localize`
- `generate-remediation`
- `generate-repair`
- `generate-variants-audit`
- `generate-variants-missing`
- `get-analytics`
- `get-assignment-progress`
- `get-auto-assign-settings`
- `get-format-registry`
- `get-ko`
- `get-org-settings`
- `get-template`
- `item-cluster-audit`
- `item-generate-more`
- `item-rewrite-quality`
- `job-events-stream`
- `job-status`
- `jobs-reconciler`
- `list-assignments`
- `list-courses-filtered`
- `list-org-students`
- `list-students-for-course`
- `list-templates`
- `log-event`
- `mcp-metrics-proxy`
- `org-config`
- `play-session`
- `regenerate-embeddings`
- `repair-candidate`
- `results-detail`
- `review-course`
- `save-org-settings`
- `search-content`
- `search-media`
- `studytext-expand`
- `studytext-rewrite`
- `studytext-visualize`
- `test-anthropic`
- `test-create-job`
- `test-emit-job-event`
- `update-auto-assign-settings`
- `update-catalog`

### New edge functions in current

- `adopt-media`
- `blueprint-library`
- `create-tag`
- `delete-job`
- `download-release`
- `env-audit`
- `fix-schema`
- `get-course-job`
- `get-job-metrics`
- `get-org-config`
- `get-record`
- `get-user-roles`
- `health`
- `list-course-jobs`
- `list-edge-logs`
- `list-media-jobs`
- `list-records`
- `manage-media`
- `process-pending-jobs`
- `requeue-job`
- `resume-session`
- `save-course-json`
- `save-plan`
- `save-record`
- `ui-audit`

## Current-app smell checks (likely “UI parity but not functional”)

- **Hardcoded IDs** (e.g. `student-2`, `teacher-1`): **42** occurrences
- **Navigation to missing routes**: **0** occurrences

### Hardcoded IDs (first 42)

- `src/pages/teacher/TeacherDashboard.tsx:45` — `id: "mock-class-1",`
- `src/pages/teacher/TeacherDashboard.tsx:48` — `owner: "teacher-1",`
- `src/pages/teacher/TeacherDashboard.tsx:55` — `id: "mock-student-1",`
- `src/pages/teacher/TeacherDashboard.tsx:57` — `classIds: ["mock-class-1"],`
- `src/pages/teacher/TeacherDashboard.tsx:60` — `id: "mock-student-2",`
- `src/pages/teacher/TeacherDashboard.tsx:62` — `classIds: ["mock-class-1"],`
- `src/pages/parent/Goals.tsx:140` — `studentId: "mock-student-1",`
- `src/pages/parent/Goals.tsx:156` — `studentId: "mock-student-1",`
- `src/lib/student/__tests__/goalsMappers.test.ts:10` — `studentId: 'student-1',`
- `src/lib/student/__tests__/goalsMappers.test.ts:22` — `studentId: 'student-1',`
- `src/lib/student/__tests__/timelineMappers.test.ts:8` — `studentId: 'student-1',`
- `src/lib/student/__tests__/timelineMappers.test.ts:35` — `studentId: 'student-1',`
- `src/lib/mocks/knowledgeMockData.ts:35` — `'student-1', // Alex (self-directed, high mastery)`
- `src/lib/mocks/knowledgeMockData.ts:36` — `'student-2', // Bailey (teacher-assigned, medium mastery)`
- `src/lib/mocks/knowledgeMockData.ts:37` — `'student-3', // Casey (parent-assigned, low mastery)`
- `src/lib/mocks/knowledgeMockData.ts:38` — `'student-4', // Drew (autonomous AI, high mastery)`
- `src/lib/mocks/knowledgeMockData.ts:39` — `'student-5', // Elliot (struggling, multiple assignments)`
- `src/lib/mocks/knowledgeMockData.ts:42` — `const MOCK_TEACHER_ID = 'teacher-1';`
- `src/lib/mocks/knowledgeMockData.ts:43` — `const MOCK_PARENT_ID = 'parent-1';`
- `src/lib/mocks/knowledgeMockData.ts:44` — `const MOCK_CLASS_ID = 'class-123';`
- `src/lib/api/knowledgeMap.ts:207` — `const studentIds = ['student-2', 'student-5'];`
- `src/lib/api/knowledgeMap.ts:226` — `classId: 'class-1',`
- `src/lib/api/knowledgeMap.ts:488` — `// Only student-4 (Drew) has auto-assign enabled`
- `src/lib/api/knowledgeMap.ts:489` — `if (studentId === 'student-4') {`
- `src/hooks/useKnowledgeMap.ts:71` — `* const { skills, isLoading } = useStudentSkills({ studentId: 'student-1', domain: 'math' });`
- `src/hooks/useKnowledgeMap.ts:108` — `* const { domains, isLoading } = useDomainGrowth('student-3');`
- `src/hooks/useKnowledgeMap.ts:145` — `*   teacherId: 'teacher-1',`
- `src/hooks/useKnowledgeMap.ts:185` — `*   studentId: 'student-2',`
- `src/hooks/useKnowledgeMap.ts:227` — `*   studentId: 'student-1'`
- `src/hooks/useKnowledgeMap.ts:269` — `* const { settings, updateSettings, isLoading } = useAutoAssignSettings('student-4');`
- `src/hooks/useKnowledgeMap.ts:325` — `*   studentIds: ['student-1', 'student-2'],`
- `src/hooks/useKnowledgeMap.ts:328` — `*   assignedBy: 'teacher-1',`
- `src/hooks/useKnowledgeMap.ts:385` — `*   studentId: 'student-1',`
- `src/hooks/useMCP.ts:84` — `participant_ids: ['user-1', 'teacher-1'],`
- `src/components/student/SkillCards.tsx:313` — `assignedBy: 'teacher-1',`
- `src/components/student/StudentAssignments.tsx:317` — `assignedBy: "teacher-1",`
- `src/components/student/StudentAssignments.tsx:355` — `assignedBy: "teacher-1",`
- `src/components/shared/AssignmentModal.tsx:533` — `{ id: "student-2", name: "Bailey Johnson" },`
- `src/components/shared/AssignmentModal.tsx:534` — `{ id: "student-5", name: "Elliot Martinez" },`
- `src/components/shared/AutoAssignSettings.tsx:421` — `// Drew (student-4) has autonomous mode enabled`
- `src/components/shared/AutoAssignSettings.tsx:422` — `if (studentId === "student-4") {`
- `src/components/shared/AutoAssignSettings.tsx:444` — `if (studentId !== "student-4") return [];`

## Manifest parity (`system-manifest.json`)

- **data_model.root_entities**: 🟡 (missing in current: 0, missing in legacy: 9)
- **data_model.child_entities**: 🟡 (missing in current: 0, missing in legacy: 2)
- **agent_jobs**: 🟡 (missing in current: 0, missing in legacy: 5)
- **edge_functions**: 🟡 (missing in current: 0, missing in legacy: 28)


### New in current (current manifest)

- `add-class-member`
- `create-child-code`
- `create-class`
- `editor-auto-fix`
- `editor-co-pilot`
- `editor-repair-course`
- `editor-variants-missing`
- `game-log-attempt`
- `game-start-round`
- `generate-assignment`
- `generate-class-code`
- `generate-hint`
- `generate-remediation`
- `generate-variants-audit`
- `get-analytics`
- `get-domain-growth`
- `get-recommended-courses`
- `get-student-skills`
- `invite-student`
- `join-class`
- `link-child`
- `list-conversations`
- `list-messages`
- `mcp-metrics-proxy`
- `remove-class-member`
- `send-message`
- `update-mastery`
- `validate-course-structure`

## pages

| Status | Path |
|---|---|
| 🟡 | `src/pages/__tests__/Courses.catalogVersionListener.test.tsx` |
| 🟡 | `src/pages/About.tsx` |
| 🟡 | `src/pages/Admin.tsx` |
| 🟡 | `src/pages/admin/AIPipeline.tsx` |
| 🟡 | `src/pages/admin/CourseEditor.tsx` |
| 🟡 | `src/pages/admin/CourseSelector.tsx` |
| 🟡 | `src/pages/admin/CourseVersionHistory.tsx` |
| 🟡 | `src/pages/admin/JobsDashboard.tsx` |
| 🟡 | `src/pages/admin/Logs.tsx` |
| 🟡 | `src/pages/admin/MediaManager.tsx` |
| 🟡 | `src/pages/admin/Metrics.tsx` |
| 🟡 | `src/pages/admin/SystemHealth.tsx` |
| 🟡 | `src/pages/admin/TagApprovalQueue.tsx` |
| 🟡 | `src/pages/admin/TagManagement.tsx` |
| 🟡 | `src/pages/Auth.tsx` |
| 🟡 | `src/pages/auth/ResetPassword.tsx` |
| 🟡 | `src/pages/Courses.tsx` |
| 🟡 | `src/pages/dev/Diagnostics.tsx` |
| 🟡 | `src/pages/dev/OptionFitHarness.tsx` |
| 🟡 | `src/pages/DevHealth.tsx` |
| 🟡 | `src/pages/docs/IntegrationGuide.tsx` |
| 🟡 | `src/pages/embed/Thanks.tsx` |
| 🟡 | `src/pages/Help.tsx` |
| 🟡 | `src/pages/Home.tsx` |
| 🟡 | `src/pages/Kids.tsx` |
| 🟡 | `src/pages/messages/Inbox.tsx` |
| 🟡 | `src/pages/parent/Dashboard.tsx` |
| 🟡 | `src/pages/parent/Goals.tsx` |
| 🟡 | `src/pages/parent/LinkChild.tsx` |
| 🟡 | `src/pages/parent/Subjects.tsx` |
| 🟡 | `src/pages/parent/Timeline.tsx` |
| 🟡 | `src/pages/parent/Topics.tsx` |
| 🟡 | `src/pages/Parents.tsx` |
| 🟡 | `src/pages/Play.tsx` |
| 🟡 | `src/pages/PlayWelcome.tsx` |
| 🟡 | `src/pages/Results.tsx` |
| 🟡 | `src/pages/Schools.tsx` |
| 🟡 | `src/pages/student/Assignments.tsx` |
| 🟡 | `src/pages/student/Dashboard.tsx` |
| 🟡 | `src/pages/student/Goals.tsx` |
| 🟡 | `src/pages/student/JoinClass.tsx` |
| 🟡 | `src/pages/student/Timeline.tsx` |
| 🟡 | `src/pages/teacher/Analytics.tsx` |
| 🟡 | `src/pages/teacher/AssignmentProgress.tsx` |
| 🟡 | `src/pages/teacher/Assignments.tsx` |
| 🟡 | `src/pages/teacher/Classes.tsx` |
| 🟡 | `src/pages/teacher/ClassProgress.tsx` |
| 🟡 | `src/pages/teacher/Students.tsx` |
| 🟡 | `src/pages/teacher/TeacherDashboard.tsx` |
| ❌ (missing in current) | `src/pages/parent/__tests__/Dashboard.test.tsx` |
| ❌ (missing in current) | `src/pages/parent/__tests__/Goals.test.tsx` |
| ❌ (missing in current) | `src/pages/parent/__tests__/Subjects.test.tsx` |
| ❌ (missing in current) | `src/pages/parent/__tests__/Timeline.test.tsx` |
| ❌ (missing in current) | `src/pages/parent/__tests__/Topics.test.tsx` |
| ❌ (missing in current) | `src/pages/student/__tests__/Assignments.test.tsx` |
| ❌ (missing in current) | `src/pages/student/__tests__/Dashboard.test.tsx` |
| ❌ (missing in current) | `src/pages/student/__tests__/Goals.test.tsx` |
| ❌ (missing in current) | `src/pages/student/__tests__/Timeline.test.tsx` |
| ❌ (missing in current) | `src/pages/teacher/__tests__/TeacherDashboard.test.tsx` |
| ➕ (new in current) | `src/pages/admin/AIPipelineV2.tsx` |
| ➕ (new in current) | `src/pages/admin/editor/hooks/useCourseCoPilot.ts` |
| ➕ (new in current) | `src/pages/admin/editor/hooks/useCoursePublishing.ts` |
| ➕ (new in current) | `src/pages/admin/editor/hooks/useCourseVariants.ts` |
| ➕ (new in current) | `src/pages/crm-demo/contacts/ContactList.tsx` |
| ➕ (new in current) | `src/pages/crm-demo/dashboard/Dashboard.tsx` |
| ➕ (new in current) | `src/pages/generated/pages/catalog-builder-media.tsx` |
| ➕ (new in current) | `src/pages/generated/pages/catalog-builder.tsx` |
| ➕ (new in current) | `src/pages/generated/pages/landing.tsx` |
| ➕ (new in current) | `src/pages/generated/pages/play-session-media.tsx` |
| ➕ (new in current) | `src/pages/generated/pages/settings.tsx` |
| ➕ (new in current) | `src/pages/generated/pages/teacher-control.tsx` |
| ➕ (new in current) | `src/pages/generic/GenericBoard.tsx` |
| ➕ (new in current) | `src/pages/generic/GenericList.tsx` |
| ➕ (new in current) | `src/pages/workspace/AssignmentEditor.tsx` |
| ➕ (new in current) | `src/pages/workspace/components/EntityForm.tsx` |
| ➕ (new in current) | `src/pages/workspace/CourseBlueprintEditor.tsx` |
| ➕ (new in current) | `src/pages/workspace/index.ts` |
| ➕ (new in current) | `src/pages/workspace/JobTicketEditor.tsx` |
| ➕ (new in current) | `src/pages/workspace/LearnerProfileEditor.tsx` |
| ➕ (new in current) | `src/pages/workspace/MessageThreadEditor.tsx` |
| ✅ | `src/pages/__tests__/Play.skillFocus.test.tsx` |
| ✅ | `src/pages/admin/PerformanceMonitoring.tsx` |
| ✅ | `src/pages/DevGuard.tsx` |
| ✅ | `src/pages/NotFound.tsx` |
| ✅ | `src/pages/student/Achievements.tsx` |

## components

| Status | Path |
|---|---|
| 🟡 | `src/components/admin/ChatInput.tsx` |
| 🟡 | `src/components/admin/ChatPanel.tsx` |
| 🟡 | `src/components/admin/CoursePicker.tsx` |
| 🟡 | `src/components/admin/CourseReviewTab.tsx` |
| 🟡 | `src/components/admin/editor/ComparePanel.tsx` |
| 🟡 | `src/components/admin/editor/Navigator.tsx` |
| 🟡 | `src/components/admin/editor/StemTab.tsx` |
| 🟡 | `src/components/admin/GenerateCourseForm.tsx` |
| 🟡 | `src/components/admin/ImageGenerateButton.tsx` |
| 🟡 | `src/components/admin/ItemEditor.tsx` |
| 🟡 | `src/components/admin/MediaLibrary.tsx` |
| 🟡 | `src/components/admin/pipeline/__tests__/LiveLogs.autoscroll.test.tsx` |
| 🟡 | `src/components/admin/pipeline/__tests__/OverviewTab.phases.test.tsx` |
| 🟡 | `src/components/admin/pipeline/LeftSidebar/index.tsx` |
| 🟡 | `src/components/admin/pipeline/LeftSidebar/QuickStartPanel.tsx` |
| 🟡 | `src/components/admin/pipeline/MainCanvas/index.tsx` |
| 🟡 | `src/components/admin/pipeline/MainCanvas/OverviewTab.tsx` |
| 🟡 | `src/components/admin/pipeline/PipelineLayout.tsx` |
| 🟡 | `src/components/admin/pipeline/RightInspector/index.tsx` |
| 🟡 | `src/components/admin/pipeline/RightInspector/PhaseTimeline.tsx` |
| 🟡 | `src/components/admin/pipeline/RightInspector/SystemHealth.tsx` |
| 🟡 | `src/components/admin/pipeline/shared/JobCard.tsx` |
| 🟡 | `src/components/admin/pipeline/shared/PhaseAccordion.tsx` |
| 🟡 | `src/components/admin/pipeline/shared/PhaseProgressStepper.tsx` |
| 🟡 | `src/components/admin/pipeline/shared/ReviewFeedback.tsx` |
| 🟡 | `src/components/admin/StimulusEditor.tsx` |
| 🟡 | `src/components/admin/StimulusPanel.tsx` |
| 🟡 | `src/components/admin/StudyTextsEditor.tsx` |
| 🟡 | `src/components/admin/tags/TagApprovalCard.tsx` |
| 🟡 | `src/components/admin/tags/TagTypeManager.tsx` |
| 🟡 | `src/components/admin/tags/TagValueEditor.tsx` |
| 🟡 | `src/components/game/GameSidebar.tsx` |
| 🟡 | `src/components/game/GroupGrid.tsx` |
| 🟡 | `src/components/game/OptionGrid.tsx` |
| 🟡 | `src/components/game/Stem.tsx` |
| 🟡 | `src/components/game/WrongModal.tsx` |
| 🟡 | `src/components/layout/CourseFrame.tsx` |
| 🟡 | `src/components/layout/Footer.tsx` |
| 🟡 | `src/components/layout/HamburgerMenu.tsx` |
| 🟡 | `src/components/layout/Header.tsx` |
| 🟡 | `src/components/layout/Layout.tsx` |
| 🟡 | `src/components/layout/RoleNav.tsx` |
| 🟡 | `src/components/learning/StudyTextsDrawer.tsx` |
| 🟡 | `src/components/parent/ChildHeader.tsx` |
| 🟡 | `src/components/parent/GoalProgressCard.tsx` |
| 🟡 | `src/components/parent/GoalsGlance.tsx` |
| 🟡 | `src/components/parent/GrowthTracker.tsx` |
| 🟡 | `src/components/parent/ParentLayout.tsx` |
| 🟡 | `src/components/parent/RecentActivityCard.tsx` |
| 🟡 | `src/components/parent/RecentTopicsCard.tsx` |
| 🟡 | `src/components/parent/SubjectTimeCard.tsx` |
| 🟡 | `src/components/parent/SubjectTimeGlance.tsx` |
| 🟡 | `src/components/parent/WeeklyComparisonChart.tsx` |
| 🟡 | `src/components/shared/AssignmentModal.tsx` |
| 🟡 | `src/components/shared/AutoAssignSettings.tsx` |
| 🟡 | `src/components/shared/JobProgress.tsx` |
| 🟡 | `src/components/shared/RecommendedCoursesModal.tsx` |
| 🟡 | `src/components/student/BrowseAllSkills.tsx` |
| 🟡 | `src/components/student/SkillCards.tsx` |
| 🟡 | `src/components/student/StudentAssignments.tsx` |
| 🟡 | `src/components/system/FallbackBanner.tsx` |
| 🟡 | `src/components/teacher/AssignCourseModal.tsx` |
| 🟡 | `src/components/teacher/ClassFocusWidget.tsx` |
| 🟡 | `src/components/teacher/TeacherKOTable.tsx` |
| 🟡 | `src/components/ui/command.tsx` |
| 🟡 | `src/components/ui/context-menu.tsx` |
| 🟡 | `src/components/ui/dropdown-menu.tsx` |
| 🟡 | `src/components/ui/hover-card.tsx` |
| 🟡 | `src/components/ui/menubar.tsx` |
| 🟡 | `src/components/ui/navigation-menu.tsx` |
| 🟡 | `src/components/ui/popover.tsx` |
| 🟡 | `src/components/ui/select.tsx` |
| 🟡 | `src/components/ui/sonner.tsx` |
| 🟡 | `src/components/ui/textarea.tsx` |
| 🟡 | `src/components/ui/tooltip.tsx` |
| ➕ (new in current) | `src/components/admin/pipeline/LeftSidebar/QueueStatusSummary.tsx` |
| ➕ (new in current) | `src/components/admin/pipeline/MainCanvas/JobActions.tsx` |
| ➕ (new in current) | `src/components/admin/pipeline/MainCanvas/JobProgressVisualization.tsx` |
| ➕ (new in current) | `src/components/admin/pipeline/TopBar/JobFilters.tsx` |
| ➕ (new in current) | `src/components/auth/ProtectedRoute.tsx` |
| ➕ (new in current) | `src/components/AuthGuard.tsx` |
| ➕ (new in current) | `src/components/game/GameRouter.tsx` |
| ➕ (new in current) | `src/components/system/DawnDataBanner.tsx` |
| ➕ (new in current) | `src/components/system/ModeBanner.tsx` |
| ✅ | `src/components/admin/__tests__/ImageGenerateButton.test.tsx` |
| ✅ | `src/components/admin/AddCourseModal.tsx` |
| ✅ | `src/components/admin/CourseGenerationProgress.tsx` |
| ✅ | `src/components/admin/CourseItemsList.tsx` |
| ✅ | `src/components/admin/DiffViewer.tsx` |
| ✅ | `src/components/admin/editor/__tests__/OptionsTab.test.tsx` |
| ✅ | `src/components/admin/editor/AIRewriteChatPanel.tsx` |
| ✅ | `src/components/admin/editor/ExercisesTab.tsx` |
| ✅ | `src/components/admin/editor/MediaLibraryPanel.tsx` |
| ✅ | `src/components/admin/editor/OptionsTab.tsx` |
| ✅ | `src/components/admin/editor/ReferenceTab.tsx` |
| ✅ | `src/components/admin/ItemPreview.tsx` |
| ✅ | `src/components/admin/pipeline/__tests__/PhaseTimeline.status.test.tsx` |
| ✅ | `src/components/admin/pipeline/LeftSidebar/ActiveJobsList.tsx` |
| ✅ | `src/components/admin/pipeline/LeftSidebar/RecentJobsList.tsx` |
| ✅ | `src/components/admin/pipeline/MainCanvas/OutputTab.tsx` |
| ✅ | `src/components/admin/pipeline/MainCanvas/PhasesTab.tsx` |
| ✅ | `src/components/admin/pipeline/MainCanvas/PromptsTab.tsx` |
| ✅ | `src/components/admin/pipeline/RightInspector/LiveLogs.tsx` |
| ✅ | `src/components/admin/pipeline/shared/MetricCard.tsx` |
| ✅ | `src/components/admin/pipeline/Skeleton.tsx` |
| ✅ | `src/components/admin/RegenerationModal.tsx` |
| ✅ | `src/components/courses/CourseCard.tsx` |
| ✅ | `src/components/game/AllAdvancedExercises.tsx` |
| ✅ | `src/components/game/AudioMCQ.tsx` |
| ✅ | `src/components/game/CorrectFlash.tsx` |
| ✅ | `src/components/game/DiagramLabeling.tsx` |
| ✅ | `src/components/game/DragDropClassify.tsx` |
| ✅ | `src/components/game/FeedbackAnnouncer.tsx` |
| ✅ | `src/components/game/GameStats.tsx` |
| ✅ | `src/components/game/GraphInterpretation.tsx` |
| ✅ | `src/components/game/ManipulativeNumeric.tsx` |
| ✅ | `src/components/game/MatchingPairs.tsx` |
| ✅ | `src/components/game/NumericPad.tsx` |
| ✅ | `src/components/game/OptionGrid.smart-fit.test.tsx` |
| ✅ | `src/components/game/OptionGrid.video-fit.test.tsx` |
| ✅ | `src/components/game/OptionGrid/hooks.ts` |
| ✅ | `src/components/game/OptionGrid/tiles.tsx` |
| ✅ | `src/components/game/OrderingSequence.tsx` |
| ✅ | `src/components/game/PlayErrorBoundary.tsx` |
| ✅ | `src/components/game/ProgressBar.tsx` |
| ✅ | `src/components/game/SkipLink.tsx` |
| ✅ | `src/components/game/TimedFluency.tsx` |
| ✅ | `src/components/game/VariantLevelSelector.tsx` |
| ✅ | `src/components/game/VideoPrompt.tsx` |
| ✅ | `src/components/game/VisualMCQ.fit.test.tsx` |
| ✅ | `src/components/game/VisualMCQ.test.tsx` |
| ✅ | `src/components/game/VisualMCQ.tsx` |
| ✅ | `src/components/layout/AdminLayout.tsx` |
| ✅ | `src/components/layout/PageContainer.tsx` |
| ✅ | `src/components/parent/ActivityGlance.tsx` |
| ✅ | `src/components/parent/ActivityTimeline.tsx` |
| ✅ | `src/components/parent/AlertsPanel.tsx` |
| ✅ | `src/components/parent/EditableGoalsPanel.tsx` |
| ✅ | `src/components/parent/GoalProgress.tsx` |
| ✅ | `src/components/parent/GoalsPanel.tsx` |
| ✅ | `src/components/parent/KpiCard.tsx` |
| ✅ | `src/components/parent/ParentSummaryCards.tsx` |
| ✅ | `src/components/parent/SubjectTimeChart.tsx` |
| ✅ | `src/components/parent/SummaryCards.tsx` |
| ✅ | `src/components/parent/TopicsGlance.tsx` |
| ✅ | `src/components/parent/TopicsHandled.tsx` |
| ✅ | `src/components/shared/__tests__/AssignmentModal.test.tsx` |
| ✅ | `src/components/shared/__tests__/RecommendedCoursesModal.test.tsx` |
| ✅ | `src/components/student/AchievementsGlance.tsx` |
| ✅ | `src/components/student/ContinueCard.tsx` |
| ✅ | `src/components/student/NextUpCard.tsx` |
| ✅ | `src/components/student/RecentSessionsStudent.tsx` |
| ✅ | `src/components/student/RecommendationsCard.tsx` |
| ✅ | `src/components/student/StudentLayout.tsx` |
| ✅ | `src/components/student/SummaryCardsStudent.tsx` |
| ✅ | `src/components/student/WeeklyGoalRing.tsx` |
| ✅ | `src/components/teacher/AssignStudentsModal.tsx` |
| ✅ | `src/components/ui/accordion.tsx` |
| ✅ | `src/components/ui/alert-dialog.tsx` |
| ✅ | `src/components/ui/alert.tsx` |
| ✅ | `src/components/ui/aspect-ratio.tsx` |
| ✅ | `src/components/ui/avatar.tsx` |
| ✅ | `src/components/ui/badge.tsx` |
| ✅ | `src/components/ui/breadcrumb.tsx` |
| ✅ | `src/components/ui/button.tsx` |
| ✅ | `src/components/ui/calendar.tsx` |
| ✅ | `src/components/ui/card.tsx` |
| ✅ | `src/components/ui/carousel.tsx` |
| ✅ | `src/components/ui/chart.tsx` |
| ✅ | `src/components/ui/checkbox.tsx` |
| ✅ | `src/components/ui/collapsible.tsx` |
| ✅ | `src/components/ui/dialog.tsx` |
| ✅ | `src/components/ui/drawer.tsx` |
| ✅ | `src/components/ui/form.tsx` |
| ✅ | `src/components/ui/input-otp.tsx` |
| ✅ | `src/components/ui/input.tsx` |
| ✅ | `src/components/ui/label.tsx` |
| ✅ | `src/components/ui/pagination.tsx` |
| ✅ | `src/components/ui/progress.tsx` |
| ✅ | `src/components/ui/radio-group.tsx` |
| ✅ | `src/components/ui/resizable.tsx` |
| ✅ | `src/components/ui/scroll-area.tsx` |
| ✅ | `src/components/ui/separator.tsx` |
| ✅ | `src/components/ui/sheet.tsx` |
| ✅ | `src/components/ui/sidebar.tsx` |
| ✅ | `src/components/ui/skeleton.tsx` |
| ✅ | `src/components/ui/slider.tsx` |
| ✅ | `src/components/ui/switch.tsx` |
| ✅ | `src/components/ui/table.tsx` |
| ✅ | `src/components/ui/tabs.tsx` |
| ✅ | `src/components/ui/toast.tsx` |
| ✅ | `src/components/ui/toaster.tsx` |
| ✅ | `src/components/ui/toggle-group.tsx` |
| ✅ | `src/components/ui/toggle.tsx` |
| ✅ | `src/components/ui/use-toast.ts` |

## hooks

| Status | Path |
|---|---|
| 🟡 | `src/hooks/__tests__/useJobContext.test.tsx` |
| 🟡 | `src/hooks/useAuth.ts` |
| 🟡 | `src/hooks/useCoursePreloader.ts` |
| 🟡 | `src/hooks/useDashboard.ts` |
| 🟡 | `src/hooks/useGameState.ts` |
| 🟡 | `src/hooks/useJobContext.ts` |
| 🟡 | `src/hooks/useJobQuota.ts` |
| 🟡 | `src/hooks/useJobsList.ts` |
| 🟡 | `src/hooks/useJobStatus.ts` |
| 🟡 | `src/hooks/useKnowledgeMap.ts` |
| 🟡 | `src/hooks/useMediaJobRealtime.ts` |
| 🟡 | `src/hooks/useParentDashboard.ts` |
| 🟡 | `src/hooks/useParentGoals.ts` |
| 🟡 | `src/hooks/useParentSubjects.ts` |
| 🟡 | `src/hooks/useParentTimeline.ts` |
| 🟡 | `src/hooks/useParentTopics.ts` |
| 🟡 | `src/hooks/usePipelineJob.ts` |
| 🟡 | `src/hooks/useSentryUser.ts` |
| 🟡 | `src/hooks/useStudentAssignments.ts` |
| 🟡 | `src/hooks/useStudentGoals.ts` |
| 🟡 | `src/hooks/useStudentTimeline.ts` |
| 🟡 | `src/hooks/useTeacherDashboard.ts` |
| 🟡 | `src/hooks/useTTS.ts` |
| ➕ (new in current) | `src/hooks/__mocks__/useMCP.ts` |
| ➕ (new in current) | `src/hooks/useClassManagement.ts` |
| ➕ (new in current) | `src/hooks/useCta.ts` |
| ➕ (new in current) | `src/hooks/useGameSession.ts` |
| ➕ (new in current) | `src/hooks/useMCP.ts` |
| ➕ (new in current) | `src/hooks/useMessaging.ts` |
| ➕ (new in current) | `src/hooks/useParentData.ts` |
| ➕ (new in current) | `src/hooks/useStudentAchievements.ts` |
| ➕ (new in current) | `src/hooks/useStudentData.ts` |
| ✅ | `src/hooks/use-mobile.tsx` |
| ✅ | `src/hooks/use-toast.ts` |
| ✅ | `src/hooks/useCatalogVersionListener.ts` |
| ✅ | `src/hooks/useCoursePreview.ts` |
| ✅ | `src/hooks/useKeyboardShortcuts.ts` |
| ✅ | `src/hooks/useParentRange.test.ts` |
| ✅ | `src/hooks/useParentRange.ts` |
| ✅ | `src/hooks/useStudentRange.test.ts` |
| ✅ | `src/hooks/useStudentRange.ts` |
| ✅ | `src/hooks/useVariantLevel.ts` |

## lib_api

| Status | Path |
|---|---|
| 🟡 | `src/lib/api/assignments.ts` |
| 🟡 | `src/lib/api/auth.ts` |
| 🟡 | `src/lib/api/catalog.ts` |
| 🟡 | `src/lib/api/classes.ts` |
| 🟡 | `src/lib/api/common.ts` |
| 🟡 | `src/lib/api/course.ts` |
| 🟡 | `src/lib/api/game.ts` |
| 🟡 | `src/lib/api/knowledgeMap.ts` |
| 🟡 | `src/lib/api/orgConfig.ts` |
| 🟡 | `src/lib/api/parentDashboard.ts` |
| 🟡 | `src/lib/api/parentGoals.ts` |
| 🟡 | `src/lib/api/parentSubjects.ts` |
| 🟡 | `src/lib/api/parentTimeline.ts` |
| 🟡 | `src/lib/api/parentTopics.ts` |
| 🟡 | `src/lib/api/roles.ts` |
| ➕ (new in current) | `src/lib/api/jobs.ts` |
| ➕ (new in current) | `src/lib/api/media.ts` |
| ✅ | `src/lib/api/aiRewrites.ts` |
| ✅ | `src/lib/api/analytics.ts` |
| ✅ | `src/lib/api/coursesFiltered.ts` |
| ✅ | `src/lib/api/messaging.ts` |
| ✅ | `src/lib/api/publishCourse.ts` |
| ✅ | `src/lib/api/restoreCourse.ts` |
| ✅ | `src/lib/api/searchContent.ts` |
| ✅ | `src/lib/api/searchMedia.ts` |
| ✅ | `src/lib/api/studentGoals.ts` |
| ✅ | `src/lib/api/studentTimeline.ts` |
| ✅ | `src/lib/api/updateCourse.ts` |

## supabase_edge_functions

| Status | Path |
|---|---|
| 🟡 | `supabase/functions/_shared/ai-providers.ts` |
| 🟡 | `supabase/functions/_shared/ai.ts` |
| 🟡 | `supabase/functions/_shared/auth.ts` |
| 🟡 | `supabase/functions/_shared/candidates.selfReview.test.ts` |
| 🟡 | `supabase/functions/_shared/cors.ts` |
| 🟡 | `supabase/functions/_shared/course-validator.ts` |
| 🟡 | `supabase/functions/_shared/enrichment-guardrails.test.ts` |
| 🟡 | `supabase/functions/_shared/env.ts` |
| 🟡 | `supabase/functions/_shared/filler.ts` |
| 🟡 | `supabase/functions/_shared/generation-utils.extra.test.ts` |
| 🟡 | `supabase/functions/_shared/generation-utils.repair.test.ts` |
| 🟡 | `supabase/functions/_shared/generation-utils.test.ts` |
| 🟡 | `supabase/functions/_shared/generation-utils.ts` |
| 🟡 | `supabase/functions/_shared/job-events.ts` |
| 🟡 | `supabase/functions/_shared/log.ts` |
| 🟡 | `supabase/functions/_shared/media-providers.ts` |
| 🟡 | `supabase/functions/_shared/metadata.ts` |
| 🟡 | `supabase/functions/_shared/obs.ts` |
| 🟡 | `supabase/functions/_shared/prompts.ts` |
| 🟡 | `supabase/functions/_shared/rateLimit.ts` |
| 🟡 | `supabase/functions/_shared/README.md` |
| 🟡 | `supabase/functions/_shared/requestContext.ts` |
| 🟡 | `supabase/functions/_shared/sentry.ts` |
| 🟡 | `supabase/functions/_shared/skeleton.ts` |
| 🟡 | `supabase/functions/_shared/text-sanitizer.ts` |
| 🟡 | `supabase/functions/_shared/types.ts` |
| 🟡 | `supabase/functions/add-class-member/index.ts` |
| 🟡 | `supabase/functions/ai-job-runner/index.ts` |
| 🟡 | `supabase/functions/apply-course-patch/index.ts` |
| 🟡 | `supabase/functions/apply-job-result/handler.ts` |
| 🟡 | `supabase/functions/apply-job-result/index.ts` |
| 🟡 | `supabase/functions/archive-course/index.ts` |
| 🟡 | `supabase/functions/chat-course-assistant/index.ts` |
| 🟡 | `supabase/functions/create-child-code/index.ts` |
| 🟡 | `supabase/functions/create-class/index.ts` |
| 🟡 | `supabase/functions/delete-course/index.ts` |
| 🟡 | `supabase/functions/editor-auto-fix/index.ts` |
| 🟡 | `supabase/functions/editor-co-pilot/index.ts` |
| 🟡 | `supabase/functions/editor-repair-course/index.ts` |
| 🟡 | `supabase/functions/editor-variants-audit/index.ts` |
| 🟡 | `supabase/functions/editor-variants-missing/index.ts` |
| 🟡 | `supabase/functions/enqueue-course-media/index.ts` |
| 🟡 | `supabase/functions/enqueue-course-missing-images/index.ts` |
| 🟡 | `supabase/functions/enqueue-job/index.ts` |
| 🟡 | `supabase/functions/fix-catalog-entry/index.ts` |
| 🟡 | `supabase/functions/game-log-attempt/index.ts` |
| 🟡 | `supabase/functions/game-start-round/index.ts` |
| 🟡 | `supabase/functions/generate-class-code/index.ts` |
| 🟡 | `supabase/functions/generate-course/index.ts` |
| 🟡 | `supabase/functions/generate-course/orchestrator.ts` |
| 🟡 | `supabase/functions/generate-hint/index.ts` |
| 🟡 | `supabase/functions/generate-image/handler.ts` |
| 🟡 | `supabase/functions/generate-image/index.ts` |
| 🟡 | `supabase/functions/get-class-ko-summary/index.ts` |
| 🟡 | `supabase/functions/get-class-progress/index.ts` |
| 🟡 | `supabase/functions/get-class-roster/index.ts` |
| 🟡 | `supabase/functions/get-course/index.ts` |
| 🟡 | `supabase/functions/get-dashboard/index.ts` |
| 🟡 | `supabase/functions/get-domain-growth/index.ts` |
| 🟡 | `supabase/functions/get-job/index.ts` |
| 🟡 | `supabase/functions/get-recommended-courses/index.ts` |
| 🟡 | `supabase/functions/get-student-assignments/index.ts` |
| 🟡 | `supabase/functions/get-student-skills/index.ts` |
| 🟡 | `supabase/functions/invite-student/index.ts` |
| 🟡 | `supabase/functions/join-class/index.ts` |
| 🟡 | `supabase/functions/link-child/index.ts` |
| 🟡 | `supabase/functions/list-assignments-student/index.ts` |
| 🟡 | `supabase/functions/list-classes/index.ts` |
| 🟡 | `supabase/functions/list-conversations/index.ts` |
| 🟡 | `supabase/functions/list-courses/index.ts` |
| 🟡 | `supabase/functions/list-jobs/index.ts` |
| 🟡 | `supabase/functions/list-messages/index.ts` |
| 🟡 | `supabase/functions/media-runner/index.ts` |
| 🟡 | `supabase/functions/parent-children/index.ts` |
| 🟡 | `supabase/functions/parent-dashboard/index.ts` |
| 🟡 | `supabase/functions/parent-goals/index.ts` |
| 🟡 | `supabase/functions/parent-subjects/index.ts` |
| 🟡 | `supabase/functions/parent-timeline/index.ts` |
| 🟡 | `supabase/functions/parent-topics/index.ts` |
| 🟡 | `supabase/functions/publish-course/index.ts` |
| 🟡 | `supabase/functions/remove-class-member/index.ts` |
| 🟡 | `supabase/functions/restore-course-version/index.ts` |
| 🟡 | `supabase/functions/save-course/index.ts` |
| 🟡 | `supabase/functions/send-message/index.ts` |
| 🟡 | `supabase/functions/student-achievements/index.ts` |
| 🟡 | `supabase/functions/student-dashboard/index.ts` |
| 🟡 | `supabase/functions/student-goals/index.ts` |
| 🟡 | `supabase/functions/student-timeline/index.ts` |
| 🟡 | `supabase/functions/update-course/index.ts` |
| 🟡 | `supabase/functions/update-mastery/index.ts` |
| 🟡 | `supabase/functions/validate-course-structure/index.ts` |
| ❌ (missing in current) | `supabase/functions/_shared/candidates.generate.test.ts` |
| ❌ (missing in current) | `supabase/functions/_shared/candidates.test.ts` |
| ❌ (missing in current) | `supabase/functions/_shared/prompts.sources.test.ts` |
| ❌ (missing in current) | `supabase/functions/_shared/prompts.test.ts` |
| ❌ (missing in current) | `supabase/functions/admin-create-tag/index.ts` |
| ❌ (missing in current) | `supabase/functions/admin-wipe/index.ts` |
| ❌ (missing in current) | `supabase/functions/agent-publish-course/index.ts` |
| ❌ (missing in current) | `supabase/functions/ai-job-runner/__tests__/plan.test.ts` |
| ❌ (missing in current) | `supabase/functions/ai-job-runner/plan.ts` |
| ❌ (missing in current) | `supabase/functions/ai-recommend-assignment/index.ts` |
| ❌ (missing in current) | `supabase/functions/ai-rewrite-text/_shared/cors.ts` |
| ❌ (missing in current) | `supabase/functions/ai-rewrite-text/_shared/error.ts` |
| ❌ (missing in current) | `supabase/functions/ai-rewrite-text/_shared/log.ts` |
| ❌ (missing in current) | `supabase/functions/ai-rewrite-text/_shared/obs.ts` |
| ❌ (missing in current) | `supabase/functions/apply-job-result/__tests__/handler.test.ts` |
| ❌ (missing in current) | `supabase/functions/assign-assignees/index.ts` |
| ❌ (missing in current) | `supabase/functions/assignment-metadata/index.ts` |
| ❌ (missing in current) | `supabase/functions/check-assignment-completion/index.ts` |
| ❌ (missing in current) | `supabase/functions/create-assignment/index.ts` |
| ❌ (missing in current) | `supabase/functions/debug-catalog/index.ts` |
| ❌ (missing in current) | `supabase/functions/debug-storage/index.ts` |
| ❌ (missing in current) | `supabase/functions/enqueue-job/__tests__/schema.test.ts` |
| ❌ (missing in current) | `supabase/functions/enqueue-job/schema.ts` |
| ❌ (missing in current) | `supabase/functions/enqueue-marketing-job/index.ts` |
| ❌ (missing in current) | `supabase/functions/enqueue-media-job/__tests__/handler.test.ts` |
| ❌ (missing in current) | `supabase/functions/enqueue-media-job/handler.ts` |
| ❌ (missing in current) | `supabase/functions/enqueue-media-job/index.ts` |
| ❌ (missing in current) | `supabase/functions/export-analytics/index.ts` |
| ❌ (missing in current) | `supabase/functions/export-gradebook/index.ts` |
| ❌ (missing in current) | `supabase/functions/game-end-round/index.ts` |
| ❌ (missing in current) | `supabase/functions/generate-assignment/index.ts` |
| ❌ (missing in current) | `supabase/functions/generate-course/__tests__/orchestrator.test.ts` |
| ❌ (missing in current) | `supabase/functions/generate-course/async-images.test.ts` |
| ❌ (missing in current) | `supabase/functions/generate-course/batched-repair.test.ts` |
| ❌ (missing in current) | `supabase/functions/generate-course/ENRICHMENT_TESTS.md` |
| ❌ (missing in current) | `supabase/functions/generate-course/enrichment.test.ts` |
| ❌ (missing in current) | `supabase/functions/generate-image/__tests__/handler.test.ts` |
| ❌ (missing in current) | `supabase/functions/generate-localize/__tests__/handler.test.ts` |
| ❌ (missing in current) | `supabase/functions/generate-localize/handler.ts` |
| ❌ (missing in current) | `supabase/functions/generate-localize/index.ts` |
| ❌ (missing in current) | `supabase/functions/generate-remediation/index.ts` |
| ❌ (missing in current) | `supabase/functions/generate-repair/handler.ts` |
| ❌ (missing in current) | `supabase/functions/generate-repair/index.ts` |
| ❌ (missing in current) | `supabase/functions/generate-variants-audit/handler.ts` |
| ❌ (missing in current) | `supabase/functions/generate-variants-audit/index.ts` |
| ❌ (missing in current) | `supabase/functions/generate-variants-missing/handler.ts` |
| ❌ (missing in current) | `supabase/functions/generate-variants-missing/index.ts` |
| ❌ (missing in current) | `supabase/functions/get-analytics/index.ts` |
| ❌ (missing in current) | `supabase/functions/get-assignment-progress/index.ts` |
| ❌ (missing in current) | `supabase/functions/get-auto-assign-settings/index.ts` |
| ❌ (missing in current) | `supabase/functions/get-format-registry/index.ts` |
| ❌ (missing in current) | `supabase/functions/get-ko/index.ts` |
| ❌ (missing in current) | `supabase/functions/get-org-settings/index.ts` |
| ❌ (missing in current) | `supabase/functions/get-template/index.ts` |
| ❌ (missing in current) | `supabase/functions/item-cluster-audit/index.ts` |
| ❌ (missing in current) | `supabase/functions/item-generate-more/index.ts` |
| ❌ (missing in current) | `supabase/functions/item-rewrite-quality/index.ts` |
| ❌ (missing in current) | `supabase/functions/job-events-stream/index.ts` |
| ❌ (missing in current) | `supabase/functions/job-status/index.ts` |
| ❌ (missing in current) | `supabase/functions/jobs-reconciler/index.ts` |
| ❌ (missing in current) | `supabase/functions/list-assignments/index.ts` |
| ❌ (missing in current) | `supabase/functions/list-courses-filtered/index.ts` |
| ❌ (missing in current) | `supabase/functions/list-org-students/index.ts` |
| ❌ (missing in current) | `supabase/functions/list-students-for-course/index.ts` |
| ❌ (missing in current) | `supabase/functions/list-templates/index.ts` |
| ❌ (missing in current) | `supabase/functions/log-event/index.ts` |
| ❌ (missing in current) | `supabase/functions/mcp-metrics-proxy/index.ts` |
| ❌ (missing in current) | `supabase/functions/media-runner/__tests__/handler.test.ts` |
| ❌ (missing in current) | `supabase/functions/org-config/index.ts` |
| ❌ (missing in current) | `supabase/functions/play-session/index.ts` |
| ❌ (missing in current) | `supabase/functions/regenerate-embeddings/index.ts` |
| ❌ (missing in current) | `supabase/functions/repair-candidate/index.ts` |
| ❌ (missing in current) | `supabase/functions/results-detail/index.ts` |
| ❌ (missing in current) | `supabase/functions/review-course/index.ts` |
| ❌ (missing in current) | `supabase/functions/review-course/review-gating.test.ts` |
| ❌ (missing in current) | `supabase/functions/save-org-settings/index.ts` |
| ❌ (missing in current) | `supabase/functions/search-content/index.ts` |
| ❌ (missing in current) | `supabase/functions/search-media/index.ts` |
| ❌ (missing in current) | `supabase/functions/studytext-expand/index.ts` |
| ❌ (missing in current) | `supabase/functions/studytext-rewrite/index.ts` |
| ❌ (missing in current) | `supabase/functions/studytext-visualize/index.ts` |
| ❌ (missing in current) | `supabase/functions/test-anthropic/index.ts` |
| ❌ (missing in current) | `supabase/functions/test-create-job/index.ts` |
| ❌ (missing in current) | `supabase/functions/test-emit-job-event/index.ts` |
| ❌ (missing in current) | `supabase/functions/update-auto-assign-settings/index.ts` |
| ❌ (missing in current) | `supabase/functions/update-catalog/index.ts` |
| ➕ (new in current) | `supabase/functions/adopt-media/index.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/context-builder.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/golden-plan-checklist.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/registry.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/runner.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-ai_course_generate.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-compile_mockups.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-draft_assignment_plan.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-draft_job_description.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-generate_subtasks.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-guard_course.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-guard_plan.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-mockup_polish.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-plan_matrix_run.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-recommend_product.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-refine_plan.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/gen-summarize_article.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/mockup_polish.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/refine_plan.ts` |
| ➕ (new in current) | `supabase/functions/ai-job-runner/strategies/types.ts` |
| ➕ (new in current) | `supabase/functions/blueprint-library/index.ts` |
| ➕ (new in current) | `supabase/functions/create-tag/index.ts` |
| ➕ (new in current) | `supabase/functions/delete-job/index.ts` |
| ➕ (new in current) | `supabase/functions/deno.jsonc` |
| ➕ (new in current) | `supabase/functions/download-release/index.ts` |
| ➕ (new in current) | `supabase/functions/env-audit/index.ts` |
| ➕ (new in current) | `supabase/functions/fix-schema/index.ts` |
| ➕ (new in current) | `supabase/functions/get-course-job/index.ts` |
| ➕ (new in current) | `supabase/functions/get-job-metrics/index.ts` |
| ➕ (new in current) | `supabase/functions/get-org-config/index.ts` |
| ➕ (new in current) | `supabase/functions/get-record/index.ts` |
| ➕ (new in current) | `supabase/functions/get-user-roles/index.ts` |
| ➕ (new in current) | `supabase/functions/health/index.ts` |
| ➕ (new in current) | `supabase/functions/index.ts` |
| ➕ (new in current) | `supabase/functions/list-course-jobs/index.ts` |
| ➕ (new in current) | `supabase/functions/list-edge-logs/index.ts` |
| ➕ (new in current) | `supabase/functions/list-media-jobs/index.ts` |
| ➕ (new in current) | `supabase/functions/list-records/index.ts` |
| ➕ (new in current) | `supabase/functions/manage-media/index.ts` |
| ➕ (new in current) | `supabase/functions/process-pending-jobs/index.ts` |
| ➕ (new in current) | `supabase/functions/requeue-job/index.ts` |
| ➕ (new in current) | `supabase/functions/resume-session/index.ts` |
| ➕ (new in current) | `supabase/functions/save-course-json/index.ts` |
| ➕ (new in current) | `supabase/functions/save-plan/index.ts` |
| ➕ (new in current) | `supabase/functions/save-record/index.ts` |
| ➕ (new in current) | `supabase/functions/test-globals.d.ts` |
| ➕ (new in current) | `supabase/functions/ui-audit/index.ts` |
| ✅ | `supabase/functions/_shared/candidates.ts` |
| ✅ | `supabase/functions/_shared/course-identity.ts` |
| ✅ | `supabase/functions/_shared/course-validator.physics.test.ts` |
| ✅ | `supabase/functions/_shared/course-validator.test.ts` |
| ✅ | `supabase/functions/_shared/deterministic.ts` |
| ✅ | `supabase/functions/_shared/enrichment-guardrails.ts` |
| ✅ | `supabase/functions/_shared/error.ts` |
| ✅ | `supabase/functions/_shared/flags.ts` |
| ✅ | `supabase/functions/_shared/format-registry.ts` |
| ✅ | `supabase/functions/_shared/gates.ts` |
| ✅ | `supabase/functions/_shared/generation-strategy.ts` |
| ✅ | `supabase/functions/_shared/llm.ts` |
| ✅ | `supabase/functions/_shared/origins.ts` |
| ✅ | `supabase/functions/_shared/physics-heuristics.ts` |
| ✅ | `supabase/functions/_shared/pipeline.ts` |
| ✅ | `supabase/functions/_shared/skeleton.test.ts` |
| ✅ | `supabase/functions/_shared/TESTING.md` |
| ✅ | `supabase/functions/_shared/validation.ts` |
| ✅ | `supabase/functions/media-runner/handler.ts` |

## tests

| Status | Path |
|---|---|
| 🟡 | `tests/integration/setup.ts` |
| ❌ (missing in current) | `tests/e2e/agent-api.smoke.spec.ts` |
| ❌ (missing in current) | `tests/e2e/ai-pipeline.spec.ts` |
| ❌ (missing in current) | `tests/e2e/auth.setup.ts` |
| ❌ (missing in current) | `tests/e2e/course-editor.spec.ts` |
| ❌ (missing in current) | `tests/e2e/cta-proxy.spec.ts` |
| ❌ (missing in current) | `tests/e2e/cta-smoke.spec.ts` |
| ❌ (missing in current) | `tests/e2e/editor-diff-approve.spec.ts` |
| ❌ (missing in current) | `tests/e2e/marketing.spec.ts` |
| ❌ (missing in current) | `tests/e2e/parent-portal.smoke.spec.ts` |
| ❌ (missing in current) | `tests/e2e/phase-realtime.spec.ts` |
| ❌ (missing in current) | `tests/e2e/play-flow.spec.ts` |
| ❌ (missing in current) | `tests/e2e/portals.spec.ts` |
| ❌ (missing in current) | `tests/e2e/publish-proxy.spec.ts` |
| ❌ (missing in current) | `tests/e2e/smoke.spec.ts` |
| ❌ (missing in current) | `tests/e2e/student-assignments.spec.ts` |
| ❌ (missing in current) | `tests/e2e/tag-management.spec.ts` |
| ❌ (missing in current) | `tests/e2e/variants-proxy.spec.ts` |
| ❌ (missing in current) | `tests/hooks/useGameState.spec.ts` |
| ❌ (missing in current) | `tests/integration/candidate-path.test.ts` |
| ❌ (missing in current) | `tests/integration/edge-cases.test.ts` |
| ❌ (missing in current) | `tests/integration/edge-functions.test.ts` |
| ❌ (missing in current) | `tests/integration/generation-metadata-upsert.test.ts` |
| ❌ (missing in current) | `tests/integration/helpers.ts` |
| ❌ (missing in current) | `tests/integration/list-courses-search.test.ts` |
| ❌ (missing in current) | `tests/integration/phase1-edge-functions.test.ts` |
| ❌ (missing in current) | `tests/integration/pipeline-flow.test.ts` |
| ❌ (missing in current) | `tests/integration/publish-course-path.test.ts` |
| ❌ (missing in current) | `tests/integration/quality.test.ts` |
| ❌ (missing in current) | `tests/jest/apiCatalogMock.ts` |
| ❌ (missing in current) | `tests/jest/apiCommonMock.ts` |
| ❌ (missing in current) | `tests/jest/envMock.ts` |
| ❌ (missing in current) | `tests/jest/supabaseClientMock.ts` |
| ❌ (missing in current) | `tests/migrations/organizations.test.ts` |
| ❌ (missing in current) | `tests/unit/course-pipeline.guards.test.ts` |
| ➕ (new in current) | `tests/e2e/admin-ai-course-creation.spec.ts` |
| ➕ (new in current) | `tests/e2e/admin-course-editor.spec.ts` |
| ➕ (new in current) | `tests/e2e/admin.setup.ts` |
| ➕ (new in current) | `tests/e2e/analytics-reporting.spec.ts` |
| ➕ (new in current) | `tests/e2e/auth-flow.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-accessibility.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-admin.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-auth.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-error-handling.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-forms.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-navigation.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-pages.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-parent.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-smoke.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-student.spec.ts` |
| ➕ (new in current) | `tests/e2e/comprehensive-teacher.spec.ts` |
| ➕ (new in current) | `tests/e2e/concurrent-operations.spec.ts` |
| ➕ (new in current) | `tests/e2e/critical-user-journeys.spec.ts` |
| ➕ (new in current) | `tests/e2e/cta-coverage.generated.spec.ts` |
| ➕ (new in current) | `tests/e2e/dashboard-loading.spec.ts` |
| ➕ (new in current) | `tests/e2e/dashboard-with-data.spec.ts` |
| ➕ (new in current) | `tests/e2e/deep-linking.spec.ts` |
| ➕ (new in current) | `tests/e2e/empty-states.spec.ts` |
| ➕ (new in current) | `tests/e2e/error-boundaries.spec.ts` |
| ➕ (new in current) | `tests/e2e/export-download.spec.ts` |
| ➕ (new in current) | `tests/e2e/form-validation-advanced.spec.ts` |
| ➕ (new in current) | `tests/e2e/health-gate.setup.ts` |
| ➕ (new in current) | `tests/e2e/health-gate.spec.ts` |
| ➕ (new in current) | `tests/e2e/keyboard-accessibility.spec.ts` |
| ➕ (new in current) | `tests/e2e/learnplay-journeys.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-admin-jobs.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-ai-full-pipeline.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-ai-pipeline.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-api-integration.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-catalog-updates.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-course-editor-llm.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-course-editor-workflows.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-course-editor.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-course-management.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-course-navigation.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-edge-function-errors.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-error-recovery.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-form-validation.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-job-realtime-updates.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-media-management.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-rbac.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-session-persistence.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-student-journey.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-student-play-session.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-system-health.spec.ts` |
| ➕ (new in current) | `tests/e2e/live-teacher-features.spec.ts` |
| ➕ (new in current) | `tests/e2e/lovable-smoke.spec.ts` |
| ➕ (new in current) | `tests/e2e/media-upload-comprehensive.spec.ts` |
| ➕ (new in current) | `tests/e2e/mobile-responsive.spec.ts` |
| ➕ (new in current) | `tests/e2e/notifications.spec.ts` |
| ➕ (new in current) | `tests/e2e/pagination.spec.ts` |
| ➕ (new in current) | `tests/e2e/parent-child-linking.spec.ts` |
| ➕ (new in current) | `tests/e2e/parent.setup.ts` |
| ➕ (new in current) | `tests/e2e/performance.spec.ts` |
| ➕ (new in current) | `tests/e2e/play-session-edge-cases.spec.ts` |
| ➕ (new in current) | `tests/e2e/pre-release-smoke.spec.ts` |
| ➕ (new in current) | `tests/e2e/real-world-failures.spec.ts` |
| ➕ (new in current) | `tests/e2e/search-and-filter.spec.ts` |
| ➕ (new in current) | `tests/e2e/security-edge-cases.spec.ts` |
| ➕ (new in current) | `tests/e2e/student-class-management.spec.ts` |
| ➕ (new in current) | `tests/e2e/student.setup.ts` |
| ➕ (new in current) | `tests/e2e/tag-management-workflows.spec.ts` |
| ➕ (new in current) | `tests/e2e/teacher.setup.ts` |
| ➕ (new in current) | `tests/helpers/parse-learnplay-env.cjs` |
| ➕ (new in current) | `tests/helpers/parse-learnplay-env.ts` |
| ➕ (new in current) | `tests/integration/admin/JobsDashboard.integration.test.ts` |
| ➕ (new in current) | `tests/integration/admin/Logs.integration.test.ts` |
| ➕ (new in current) | `tests/integration/admin/SystemHealth.integration.test.ts` |
| ➕ (new in current) | `tests/integration/api-error-handling.spec.ts` |
| ➕ (new in current) | `tests/integration/api-supabase.test.ts` |
| ➕ (new in current) | `tests/integration/auth-session.spec.ts` |
| ➕ (new in current) | `tests/integration/auth-session.test.ts` |
| ➕ (new in current) | `tests/integration/courseId-storage.spec.ts` |
| ➕ (new in current) | `tests/integration/ctas/admin-ctas.spec.ts` |
| ➕ (new in current) | `tests/integration/ctas/parent-dashboard-ctas.spec.ts` |
| ➕ (new in current) | `tests/integration/ctas/student-dashboard-ctas.spec.ts` |
| ➕ (new in current) | `tests/integration/ctas/teacher-dashboard-ctas.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-function-errors.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-functions/admin.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-functions/classes.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-functions/courses.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-functions/dashboard.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-functions/generate-course.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-functions/jobs.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-functions/media.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-functions/messaging.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-functions/parent.spec.ts` |
| ➕ (new in current) | `tests/integration/edge-functions/student.spec.ts` |
| ➕ (new in current) | `tests/integration/helpers/auth.ts` |
| ➕ (new in current) | `tests/integration/helpers/config.ts` |
| ➕ (new in current) | `tests/integration/helpers/edge-function.ts` |
| ➕ (new in current) | `tests/integration/helpers/hook-testing.ts` |
| ➕ (new in current) | `tests/integration/helpers/playwright-helpers.ts` |
| ➕ (new in current) | `tests/integration/hooks/useCourseEditor.integration.test.ts` |
| ➕ (new in current) | `tests/integration/hooks/useDashboard.integration.test.ts` |
| ➕ (new in current) | `tests/integration/hooks/useMCP-methods.integration.test.ts` |
| ➕ (new in current) | `tests/integration/hooks/useParentDashboard.integration.test.ts` |
| ➕ (new in current) | `tests/integration/hooks/useParentData.integration.test.ts` |
| ➕ (new in current) | `tests/integration/job-status.spec.ts` |
| ➕ (new in current) | `tests/integration/job-status.test.ts` |
| ➕ (new in current) | `tests/integration/mcp-contract-validation.spec.ts` |
| ➕ (new in current) | `tests/integration/mcp-health.spec.ts` |
| ➕ (new in current) | `tests/integration/mcp-validation.spec.ts` |
| ➕ (new in current) | `tests/integration/navigation-flow.spec.ts` |
| ➕ (new in current) | `tests/integration/placeholder.test.ts` |
| ➕ (new in current) | `tests/integration/route-validation.spec.ts` |
| ➕ (new in current) | `tests/integration/setup-parent.setup.ts` |
| ➕ (new in current) | `tests/integration/setup-student.setup.ts` |
| ➕ (new in current) | `tests/integration/setup-teacher.setup.ts` |
| ➕ (new in current) | `tests/unit/adapters-courseAdapter.test.ts` |
| ➕ (new in current) | `tests/unit/api-common-route.test.ts` |
| ➕ (new in current) | `tests/unit/api-organizationId.test.ts` |
| ➕ (new in current) | `tests/unit/components/CourseCard.snapshot.test.tsx` |
| ➕ (new in current) | `tests/unit/components/GameSidebar.snapshot.test.tsx` |
| ➕ (new in current) | `tests/unit/components/PlayErrorBoundary.test.tsx` |
| ➕ (new in current) | `tests/unit/computed.test.ts` |
| ➕ (new in current) | `tests/unit/constants.test.ts` |
| ➕ (new in current) | `tests/unit/contracts-validation.test.ts` |
| ➕ (new in current) | `tests/unit/contracts.test.ts` |
| ➕ (new in current) | `tests/unit/courseIdExtraction.test.ts` |
| ➕ (new in current) | `tests/unit/courseTypes.test.ts` |
| ➕ (new in current) | `tests/unit/enums.test.ts` |
| ➕ (new in current) | `tests/unit/error-handling.test.ts` |
| ➕ (new in current) | `tests/unit/gameLogic.test.ts` |
| ➕ (new in current) | `tests/unit/gameState.safety.test.ts` |
| ➕ (new in current) | `tests/unit/gameState.test.ts` |
| ➕ (new in current) | `tests/unit/hooks/contracts/hookContractTestUtils.ts` |
| ➕ (new in current) | `tests/unit/hooks/contracts/useClassManagement.contract.test.ts` |
| ➕ (new in current) | `tests/unit/hooks/contracts/useCourseCatalog.contract.test.ts` |
| ➕ (new in current) | `tests/unit/hooks/contracts/useDashboard.contract.test.ts` |
| ➕ (new in current) | `tests/unit/hooks/contracts/useJobHooks.contract.test.ts` |
| ➕ (new in current) | `tests/unit/hooks/contracts/useKnowledgeMap.contract.test.ts` |
| ➕ (new in current) | `tests/unit/hooks/contracts/useParentData.contract.test.ts` |
| ➕ (new in current) | `tests/unit/hooks/contracts/useParentHooks.contract.test.ts` |
| ➕ (new in current) | `tests/unit/hooks/contracts/useStudentHooks.contract.test.ts` |
| ➕ (new in current) | `tests/unit/hooks/useAuth-expanded.test.tsx` |
| ➕ (new in current) | `tests/unit/hooks/useCoursePublishing.test.tsx` |
| ➕ (new in current) | `tests/unit/hooks/useCourseVariants.test.tsx` |
| ➕ (new in current) | `tests/unit/hooks/useGameSession.test.tsx` |
| ➕ (new in current) | `tests/unit/hooks/useJobQuota.test.tsx` |
| ➕ (new in current) | `tests/unit/hooks/useJobStatus.test.tsx` |
| ➕ (new in current) | `tests/unit/hooks/useMCP-expanded.test.tsx` |
| ➕ (new in current) | `tests/unit/hooks/useMCP.test.tsx` |
| ➕ (new in current) | `tests/unit/imageOptimizer.test.ts` |
| ➕ (new in current) | `tests/unit/jobParser.test.ts` |
| ➕ (new in current) | `tests/unit/levels.test.ts` |
| ➕ (new in current) | `tests/unit/lib-embed-expanded.test.ts` |
| ➕ (new in current) | `tests/unit/mediaSizing.test.ts` |
| ➕ (new in current) | `tests/unit/navigation-helpers.test.ts` |
| ➕ (new in current) | `tests/unit/passwordStrength.test.ts` |
| ➕ (new in current) | `tests/unit/pipeline-logFormatter.test.ts` |
| ➕ (new in current) | `tests/unit/pipeline-phaseExtractor.test.ts` |
| ➕ (new in current) | `tests/unit/pipeline-phaseSteps.test.ts` |
| ➕ (new in current) | `tests/unit/session.test.ts` |
| ➕ (new in current) | `tests/unit/useAuth.test.ts` |
| ➕ (new in current) | `tests/unit/useMCP-auth.test.ts` |
| ➕ (new in current) | `tests/unit/useMCP-enqueueJob.test.ts` |
| ➕ (new in current) | `tests/unit/useMCP.test.ts` |
| ➕ (new in current) | `tests/unit/utils-cn.test.ts` |
| ➕ (new in current) | `tests/unit/utils-htmlUtils.test.ts` |
| ➕ (new in current) | `tests/unit/utils-imageOptimizer.test.ts` |
| ➕ (new in current) | `tests/unit/utils-mediaSizing.test.ts` |
| ➕ (new in current) | `tests/unit/utils-sanitizeHtml.test.ts` |
| ➕ (new in current) | `tests/unit/utils.test.ts` |
| ➕ (new in current) | `tests/unit/validation.test.ts` |

## scripts

| Status | Path |
|---|---|
| 🟡 | `scripts/check-no-legacy.js` |
| 🟡 | `scripts/contracts-snapshot.mjs` |
| 🟡 | `scripts/guard-all.mjs` |
| 🟡 | `scripts/mcp-ensure.mjs` |
| 🟡 | `scripts/mcp-health.mjs` |
| 🟡 | `scripts/mcp-rls-fuzz.mjs` |
| 🟡 | `scripts/mcp-scenarios.mjs` |
| 🟡 | `scripts/pipeline-smoke.mjs` |
| 🟡 | `scripts/scaffold-job.mjs` |
| 🟡 | `scripts/seed-realdb-e2e.mjs` |
| 🟡 | `scripts/seed-realdb-e2e.ts` |
| 🟡 | `scripts/token-rotator.mjs` |
| 🟡 | `scripts/ui-dead-cta-ci.mjs` |
| 🟡 | `scripts/ui-fix-dead-ctas.mjs` |
| 🟡 | `scripts/upload-courses.ts` |
| ❌ (missing in current) | `scripts/mcp-auto-fix-batch.mjs` |
| ❌ (missing in current) | `scripts/mcp-autofix-validate.mjs` |
| ❌ (missing in current) | `scripts/mcp-check-auth-health.mjs` |
| ❌ (missing in current) | `scripts/mcp-course-cache-check.mjs` |
| ❌ (missing in current) | `scripts/mcp-edge-smoke.mjs` |
| ❌ (missing in current) | `scripts/mcp-enqueue-marketing.mjs` |
| ❌ (missing in current) | `scripts/mcp-jobs-health.mjs` |
| ❌ (missing in current) | `scripts/mcp-monitor-job.mjs` |
| ❌ (missing in current) | `scripts/mcp-pr-preview-smoke.mjs` |
| ❌ (missing in current) | `scripts/mcp-publish.mjs` |
| ❌ (missing in current) | `scripts/mcp-rls-probe.mjs` |
| ❌ (missing in current) | `scripts/mcp-run-mounted.mjs` |
| ❌ (missing in current) | `scripts/mcp-smoke.mjs` |
| ❌ (missing in current) | `scripts/mcp-templates-check.mjs` |
| ❌ (missing in current) | `scripts/mcp-token-check.mjs` |
| ➕ (new in current) | `scripts/add-course-columns.mjs` |
| ➕ (new in current) | `scripts/align-to-golden-plan.ts` |
| ➕ (new in current) | `scripts/apply-admin-rls-policy.ts` |
| ➕ (new in current) | `scripts/apply-migration.mjs` |
| ➕ (new in current) | `scripts/audit-compliance.ts` |
| ➕ (new in current) | `scripts/audit-error-visibility.ts` |
| ➕ (new in current) | `scripts/audit-null-safety.ts` |
| ➕ (new in current) | `scripts/check-buckets.ts` |
| ➕ (new in current) | `scripts/check-classes.mjs` |
| ➕ (new in current) | `scripts/check-course-metadata.mjs` |
| ➕ (new in current) | `scripts/check-deps.mjs` |
| ➕ (new in current) | `scripts/check-function.mjs` |
| ➕ (new in current) | `scripts/check-job-status.mjs` |
| ➕ (new in current) | `scripts/check-org.mjs` |
| ➕ (new in current) | `scripts/check-orgs.mjs` |
| ➕ (new in current) | `scripts/check-plan.js` |
| ➕ (new in current) | `scripts/check-storage.mjs` |
| ➕ (new in current) | `scripts/check-triggers.ts` |
| ➕ (new in current) | `scripts/check-views.mjs` |
| ➕ (new in current) | `scripts/cleanup-history.ts` |
| ➕ (new in current) | `scripts/cleanup-orphan-courses.mjs` |
| ➕ (new in current) | `scripts/cleanup-pending-jobs.mjs` |
| ➕ (new in current) | `scripts/cleanup-smoke-tests.mjs` |
| ➕ (new in current) | `scripts/compile-learnplay.cjs` |
| ➕ (new in current) | `scripts/compile-mockups.ts` |
| ➕ (new in current) | `scripts/compile-now.js` |
| ➕ (new in current) | `scripts/create-admin.ts` |
| ➕ (new in current) | `scripts/create-auth-users.mjs` |
| ➕ (new in current) | `scripts/create-test-accounts.ts` |
| ➕ (new in current) | `scripts/debug-function.ts` |
| ➕ (new in current) | `scripts/debug-job-requeue.ts` |
| ➕ (new in current) | `scripts/debug-plan.ts` |
| ➕ (new in current) | `scripts/debug-section-f.cjs` |
| ➕ (new in current) | `scripts/debug-section-f.js` |
| ➕ (new in current) | `scripts/export-mocks.ts` |
| ➕ (new in current) | `scripts/factory-auto-spec.ts` |
| ➕ (new in current) | `scripts/factory-guard.ts` |
| ➕ (new in current) | `scripts/factory-import.ts` |
| ➕ (new in current) | `scripts/factory-init.ts` |
| ➕ (new in current) | `scripts/factory-launcher.ts` |
| ➕ (new in current) | `scripts/factory-package.ts` |
| ➕ (new in current) | `scripts/factory-reset.ts` |
| ➕ (new in current) | `scripts/factory-review.ts` |
| ➕ (new in current) | `scripts/fix-admin-org.ts` |
| ➕ (new in current) | `scripts/fix-course-visibility.mjs` |
| ➕ (new in current) | `scripts/fix-cta-action.ts` |
| ➕ (new in current) | `scripts/fix-duplicate-attrs.ts` |
| ➕ (new in current) | `scripts/fix-error-visibility.ts` |
| ➕ (new in current) | `scripts/fix-mock-routes.ts` |
| ➕ (new in current) | `scripts/fix-null-safety.ts` |
| ➕ (new in current) | `scripts/fix-storage-paths.mjs` |
| ➕ (new in current) | `scripts/fix-stuck-jobs.mjs` |
| ➕ (new in current) | `scripts/fix-untracked-ctas.ts` |
| ➕ (new in current) | `scripts/force-migration.ts` |
| ➕ (new in current) | `scripts/generate-cta-tests.ts` |
| ➕ (new in current) | `scripts/generate-logic.ts` |
| ➕ (new in current) | `scripts/guard-test-integrity.ts` |
| ➕ (new in current) | `scripts/harvest-lessons.ts` |
| ➕ (new in current) | `scripts/ingest-lovable.ts` |
| ➕ (new in current) | `scripts/list-tables.mjs` |
| ➕ (new in current) | `scripts/list-triggers.ts` |
| ➕ (new in current) | `scripts/parity-matrix.ts` |
| ➕ (new in current) | `scripts/plan-init.ts` |
| ➕ (new in current) | `scripts/plan-matrix.ts` |
| ➕ (new in current) | `scripts/preflight-env.ts` |
| ➕ (new in current) | `scripts/publish-release.ts` |
| ➕ (new in current) | `scripts/reload-schema.ts` |
| ➕ (new in current) | `scripts/run-admin-policy-v2.mjs` |
| ➕ (new in current) | `scripts/run-admin-policy.mjs` |
| ➕ (new in current) | `scripts/run-fix.js` |
| ➕ (new in current) | `scripts/run-mcp-diagnostics.ts` |
| ➕ (new in current) | `scripts/run-migration.ts` |
| ➕ (new in current) | `scripts/run-mockup-polish-local.ts` |
| ➕ (new in current) | `scripts/save-test-html.ts` |
| ➕ (new in current) | `scripts/scaffold-ctas.ts` |
| ➕ (new in current) | `scripts/scaffold-manifest.ts` |
| ➕ (new in current) | `scripts/seed-complete-database.ts` |
| ➕ (new in current) | `scripts/seed-database.ts` |
| ➕ (new in current) | `scripts/seed-dawn-entities.ts` |
| ➕ (new in current) | `scripts/seed-demo-projects.ts` |
| ➕ (new in current) | `scripts/seed-english-grammar-course.ts` |
| ➕ (new in current) | `scripts/seed-local-db.ts` |
| ➕ (new in current) | `scripts/seed-parent.mjs` |
| ➕ (new in current) | `scripts/seed-teacher.mjs` |
| ➕ (new in current) | `scripts/setup-admin-org.ts` |
| ➕ (new in current) | `scripts/setup-buckets.ts` |
| ➕ (new in current) | `scripts/setup-cron-job.mjs` |
| ➕ (new in current) | `scripts/setup.ts` |
| ➕ (new in current) | `scripts/simple-test.js` |
| ➕ (new in current) | `scripts/smoke-ctas.ts` |
| ➕ (new in current) | `scripts/snapshot.ts` |
| ➕ (new in current) | `scripts/storage-setup.ts` |
| ➕ (new in current) | `scripts/test-chat-quality.ts` |
| ➕ (new in current) | `scripts/test-chat-scenarios.ts` |
| ➕ (new in current) | `scripts/test-coverage.js` |
| ➕ (new in current) | `scripts/test-db.mjs` |
| ➕ (new in current) | `scripts/test-doc-dump.ts` |
| ➕ (new in current) | `scripts/test-doc-ingest.ts` |
| ➕ (new in current) | `scripts/test-enqueue.mjs` |
| ➕ (new in current) | `scripts/test-export-flow.ts` |
| ➕ (new in current) | `scripts/test-guard-plan.ts` |
| ➕ (new in current) | `scripts/test-pipeline.ts` |
| ➕ (new in current) | `scripts/validate-mockups.ts` |
| ➕ (new in current) | `scripts/verify-admin-auth.ts` |
| ➕ (new in current) | `scripts/verify-cta-coverage.ts` |
| ➕ (new in current) | `scripts/verify-live-deployment.ts` |
| ➕ (new in current) | `scripts/verify-policies.mjs` |
| ➕ (new in current) | `scripts/verify-seed-data.ts` |
| ➕ (new in current) | `scripts/verify.ts` |
| ✅ | `scripts/agent-token-rotate.mjs` |
| ✅ | `scripts/backfill-course-metadata.ts` |
| ✅ | `scripts/checkCounts.mjs` |
| ✅ | `scripts/contracts-check.mjs` |
| ✅ | `scripts/cors-smoke/get-course-smoke.ts` |
| ✅ | `scripts/cta-coverage.mjs` |
| ✅ | `scripts/docs-autogen.mjs` |
| ✅ | `scripts/fix-eslint-batch.js` |
| ✅ | `scripts/post-diagnostics-push.cjs` |
| ✅ | `scripts/run-ui-audit.mjs` |
| ✅ | `scripts/run-ui-audit.ts` |
| ✅ | `scripts/trace-promote.mjs` |
| ✅ | `scripts/trace-replay.mjs` |

## config

| Status | Path |
|---|---|
| 🟡 | `src/config/nav.ts` |

---

**Legend**: ✅ identical file content, 🟡 present in both but content differs, ❌ missing in current, ➕ new in current.
