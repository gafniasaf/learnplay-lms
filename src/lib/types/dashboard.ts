// Student Dashboard Types
export interface StudentStats {
  coursesInProgress: number;
  coursesCompleted: number;
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
  accuracyRate: number;
}

export interface UpcomingItem {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  progress: number;
  nextLevel?: number;
}

export interface RecentItem {
  id: string;
  title: string;
  type: string;
  completedAt: string;
  score: number;
  level?: number;
  timeSpent?: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  earnedAt: string;
  icon: string;
}

export interface StudentDashboard {
  role: "student";
  userId: string;
  displayName: string;
  stats: StudentStats;
  upcoming: UpcomingItem[];
  recent: RecentItem[];
  achievements: Achievement[];
}

// Teacher Dashboard Types
export interface TeacherStats {
  activeClasses: number;
  totalStudents: number;
  assignmentsActive: number;
  avgClassProgress: number;
  studentsNeedingHelp: number;
  coursesAssigned: number;
}

export interface TeacherUpcomingItem {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  classId?: string;
  courseId?: string;
  studentsCompleted?: number;
  studentsTotal?: number;
  avgScore?: number;
  participants?: number;
}

export interface TeacherRecentItem {
  id: string;
  title: string;
  type: string;
  completedAt: string;
  classId?: string;
  courseId?: string;
  studentsCompleted?: number;
  studentsTotal?: number;
  avgScore?: number;
}

export interface Alert {
  id: string;
  type: string;
  priority: "low" | "medium" | "high";
  message: string;
  timestamp: string;
  students?: string[];
  courseId?: string;
  classId?: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  grade: number;
  studentCount: number;
  avgProgress: number;
}

export interface TeacherDashboard {
  role: "teacher";
  userId: string;
  displayName: string;
  stats: TeacherStats;
  upcoming: TeacherUpcomingItem[];
  recent: TeacherRecentItem[];
  alerts: Alert[];
  classes: ClassInfo[];
}

// Parent Dashboard Types
export interface ParentStats {
  children: number;
  totalCoursesActive: number;
  totalCoursesCompleted: number;
  avgAccuracy: number;
  weeklyMinutes: number;
  monthlyProgress: number;
}

export interface ChildInfo {
  id: string;
  name: string;
  grade: number;
  coursesActive: number;
  coursesCompleted: number;
  currentStreak: number;
  avgAccuracy: number;
  weeklyMinutes: number;
}

export interface ParentUpcomingItem {
  childId: string;
  childName: string;
  id: string;
  title: string;
  type: string;
  dueDate: string;
  progress: number;
  status: "on-track" | "needs-attention" | "at-risk";
}

export interface ParentRecentItem {
  childId: string;
  childName: string;
  id: string;
  title: string;
  type: string;
  completedAt: string;
  score: number;
  feedback?: string;
}

export interface Recommendation {
  childId: string;
  childName: string;
  type: string;
  message: string;
  courseId?: string;
  suggestedCourse?: string;
  priority: "low" | "medium" | "high";
}

export interface ParentDashboard {
  role: "parent";
  userId: string;
  displayName: string;
  stats: ParentStats;
  children: ChildInfo[];
  upcoming: ParentUpcomingItem[];
  recent: ParentRecentItem[];
  recommendations: Recommendation[];
}

// School Dashboard Types
export interface SchoolStats {
  totalStudents: number;
  totalTeachers: number;
  activeClasses: number;
  coursesDeployed: number;
  avgStudentProgress: number;
  activeLicenses: number;
  licenseUsage: number;
}

export interface SchoolUpcomingItem {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  attendees?: number;
  location?: string;
  departments?: string[];
  expectedAttendees?: number;
}

export interface SchoolRecentItem {
  id: string;
  title: string;
  type: string;
  completedAt: string;
  courseId?: string;
  assignedTo?: number;
  teachers?: number;
  attendees?: number;
  satisfaction?: number;
}

export interface GradePerformance {
  grade: number;
  students: number;
  avgProgress: number;
  avgAccuracy: number;
}

export interface TopCourse {
  id: string;
  title: string;
  enrollments: number;
  avgScore: number;
}

export interface TeacherEngagement {
  id: string;
  name: string;
  classCount: number;
  studentCount: number;
  avgProgress: number;
}

export interface SchoolPerformance {
  byGrade: GradePerformance[];
  topCourses: TopCourse[];
  teacherEngagement: TeacherEngagement[];
}

export interface SchoolDashboard {
  role: "school";
  userId: string;
  displayName: string;
  stats: SchoolStats;
  upcoming: SchoolUpcomingItem[];
  recent: SchoolRecentItem[];
  performance: SchoolPerformance;
  alerts: Alert[];
}

// Admin Dashboard Types
export interface AdminStats {
  totalSchools: number;
  totalStudents: number;
  totalTeachers: number;
  activeClasses: number;
  coursesPublished: number;
  avgSystemProgress: number;
  activeLicenses: number;
  licenseUsage: number;
}

export interface AdminUpcomingItem {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  status?: string;
  duration?: string;
  affectedUsers?: string;
  attendees?: number;
}

export interface AdminRecentItem {
  id: string;
  title: string;
  type: string;
  completedAt: string;
  changes?: string;
  deploymentsCount?: number;
  initialEnrollments?: number;
  students?: number;
  teachers?: number;
}

export interface SystemHealth {
  apiStatus: string;
  databaseStatus: string;
  storageStatus: string;
  uptime: number;
  avgResponseTime: number;
  errorRate: number;
}

export interface TopSchool {
  id: string;
  name: string;
  students: number;
  avgProgress: number;
  avgAccuracy: number;
}

export interface CoursePerformance {
  id: string;
  title: string;
  totalEnrollments: number;
  completionRate: number;
  avgScore: number;
  avgTimeSpent: number;
}

export interface UserGrowth {
  month: string;
  students: number;
  teachers: number;
}

export interface AdminPerformance {
  topSchools: TopSchool[];
  coursePerformance: CoursePerformance[];
  userGrowth: UserGrowth[];
}

export interface AdminDashboard {
  role: "admin";
  userId: string;
  displayName: string;
  stats: AdminStats;
  upcoming: AdminUpcomingItem[];
  recent: AdminRecentItem[];
  systemHealth: SystemHealth;
  performance: AdminPerformance;
  alerts: Alert[];
}

// Union type for all dashboard types
export type Dashboard = StudentDashboard | TeacherDashboard | ParentDashboard | SchoolDashboard | AdminDashboard;
export type DashboardRole = "student" | "teacher" | "parent" | "school" | "admin";
