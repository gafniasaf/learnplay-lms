
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

interface Assignment {
  id: string;
  title: string;
  subject: string;
  status: string;
  courseId?: string;
}

interface LearnerProfile {
  id: string;
  fullName: string;
  currentMinutes: number;
  weeklyGoalMinutes: number;
  streakDays: number;
  totalSessions: number;
  averageAccuracy: number;
}

export default function StudentDashboard() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Load data on mount
  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        // Fetch profile and assignments in parallel
        const [profileResult, assignmentsResult] = await Promise.all([
          mcp.listRecords("learner-profile", 1),
          mcp.listRecords("assignment", 5),
        ]);
        
        const profileData = profileResult as { records?: LearnerProfile[] } | null;
        const assignmentsData = assignmentsResult as { records?: Assignment[] } | null;
        
        if (profileData?.records?.[0]) {
          setProfile(profileData.records[0]);
        } else {
          // Demo data fallback
          setProfile({
            id: "demo",
            fullName: "Student",
            currentMinutes: 45,
            weeklyGoalMinutes: 60,
            streakDays: 3,
            totalSessions: 12,
            averageAccuracy: 78,
          });
        }
        
        if (assignmentsData?.records?.length) {
          setAssignments(assignmentsData.records);
        } else {
          // Demo data fallback
          setAssignments([{
            id: "demo-1",
            title: "Fractions Practice",
            subject: "Mathematics",
            status: "in_progress",
          }]);
        }
      } catch {
        toast.error("Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  // Computed values
  const full_name = profile?.fullName || "Student";
  const current_minutes = profile?.currentMinutes || 0;
  const weekly_goal_minutes = profile?.weeklyGoalMinutes || 60;
  const goal_progress = weekly_goal_minutes > 0 ? Math.round((current_minutes / weekly_goal_minutes) * 100) : 0;
  const goal_status = goal_progress >= 100 ? "Complete! 🎉" : `${goal_progress}% complete`;
  const currentAssignment = assignments[0];
  const assignment_title = currentAssignment?.title || "No assignments";
  const assignment_subject = currentAssignment?.subject || "";
  const assignment_status = currentAssignment?.status || "none";
  const sessions_today = profile?.totalSessions || 0;
  const streak_days = profile?.streakDays || 0;
  const accuracy_percent = `${profile?.averageAccuracy || 0}%`;

  const handleContinueLearning = () => {
    if (currentAssignment?.courseId) {
      nav(`/play/welcome?courseId=${currentAssignment.courseId}`);
    } else {
      nav("/play/welcome");
    }
  };

  return (
    <div className="p-6">
      
  <header className="header">
    <h1>🎓 Welcome back!</h1>
    <div className="user-info">
      <span data-field="full_name">{full_name}</span>
      <button data-cta-id="settings" data-action="navigate" data-target="/settings" onClick={() => nav("/settings")} type="button">⚙️</button>
    </div>
  </header>

  <main className="container">
    
    <section className="card goal-card">
      <h2>📊 Weekly Goal</h2>
      <div className="goal-progress">
        <div className="progress-bar">
          <div style={{ width: `${Math.min(100, goal_progress)}%` }} className="progress-fill"></div>
        </div>
        <p><span data-field="current_minutes">{current_minutes}</span> / <span data-field="weekly_goal_minutes">{weekly_goal_minutes}</span> minutes</p>
      </div>
      <span data-field="goal_status" className="badge">{goal_status}</span>
      <button data-cta-id="view-goals" data-action="navigate" data-target="/student/goals" className="btn-secondary" onClick={() => nav("/student/goals")} type="button">
        View Goals
      </button>
    </section>

    
    <section className="card assignment-card">
      <h2>📚 Continue Learning</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
      <div className="assignment-info">
        <h3 data-field="assignment_title">{assignment_title}</h3>
        <p data-field="assignment_subject">{assignment_subject}</p>
        <span data-field="assignment_status" className="badge badge-info">{assignment_status}</span>
      </div>
      )}
      <button data-cta-id="continue-learning" data-action="navigate" data-target="/play/welcome" className="btn-primary btn-large" onClick={handleContinueLearning} type="button" disabled={loading}>
        ▶️ Continue
      </button>
    </section>

    
    <section className="stats-row">
      <div className="stat-card">
        <span data-field="sessions_today" className="stat-value">{sessions_today}</span>
        <span className="stat-label">Sessions Today</span>
      </div>
      <div className="stat-card">
        <span data-field="streak_days" className="stat-value">{streak_days}</span>
        <span className="stat-label">Day Streak 🔥</span>
      </div>
      <div className="stat-card">
        <span data-field="accuracy_percent" className="stat-value">{accuracy_percent}</span>
        <span className="stat-label">Accuracy</span>
      </div>
    </section>

    
    <nav className="nav-grid">
      <a href="/student/assignments" data-cta-id="nav-assignments" data-action="navigate" data-target="/student/assignments" className="nav-card" onClick={() => nav("/student/assignments")}>
        📋 Assignments
      </a>
      <a href="/student/achievements" data-cta-id="nav-achievements" data-action="navigate" data-target="/student/achievements" className="nav-card" onClick={() => nav("/student/achievements")}>
        🏆 Achievements
      </a>
      <a href="/student/timeline" data-cta-id="nav-timeline" data-action="navigate" data-target="/student/timeline" className="nav-card" onClick={() => nav("/student/timeline")}>
        📅 Timeline
      </a>
    </nav>
  </main>

    </div>
  );
}
