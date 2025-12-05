
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

interface DashboardStats {
  totalStudents: number;
  activeAssignments: number;
  avgCompletion: number;
}

interface StrugglingStudent {
  id: string;
  name: string;
  issue: string;
}

interface Submission {
  studentName: string;
  assignmentTitle: string;
  score: number;
}

export default function TeacherDashboard() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({ totalStudents: 0, activeAssignments: 0, avgCompletion: 0 });
  const [strugglingStudents, setStrugglingStudents] = useState<StrugglingStudent[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const [studentsRes, assignmentsRes] = await Promise.all([
          mcp.listRecords("learner-profile", 100),
          mcp.listRecords("assignment", 50),
        ]);
        
        const students = (studentsRes as { records?: { id: string; fullName: string; averageAccuracy?: number }[] })?.records || [];
        const assignments = (assignmentsRes as { records?: { status: string }[] })?.records || [];
        
        const active = assignments.filter(a => a.status === "active" || a.status === "in_progress").length;
        const avgComp = students.length > 0 
          ? Math.round(students.reduce((sum, s) => sum + (s.averageAccuracy || 0), 0) / students.length) 
          : 0;
        
        setStats({ totalStudents: students.length, activeAssignments: active, avgCompletion: avgComp });
        
        // Demo struggling students
        const struggling = students.filter(s => (s.averageAccuracy || 100) < 60).slice(0, 3).map(s => ({
          id: s.id,
          name: s.fullName || "Student",
          issue: "Low accuracy",
        }));
        setStrugglingStudents(struggling.length ? struggling : [{ id: "demo", name: "No struggling students", issue: "All on track!" }]);
        
        // Demo submissions
        setRecentSubmissions([{ studentName: "Sam K.", assignmentTitle: "Fractions Quiz", score: 92 }]);
      } catch {
        toast.error("Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const total_students = loading ? "..." : stats.totalStudents;
  const active_assignments = loading ? "..." : stats.activeAssignments;
  const avg_completion = loading ? "..." : `${stats.avgCompletion}%`;

  return (
    <div className="p-6">
      
  <header className="header">
    <h1>👩‍🏫 Teacher Dashboard</h1>
    <button data-cta-id="settings" data-action="navigate" data-target="/settings" onClick={() => nav("/settings")} type="button">⚙️</button>
  </header>

  <main className="container">
    
    <section className="card">
      <h2>📊 Class Overview</h2>
      <div className="stats-row">
        <div className="stat-card">
          <span data-field="total_students" className="stat-value">{total_students}</span>
          <span className="stat-label">Students</span>
        </div>
        <div className="stat-card">
          <span data-field="active_assignments" className="stat-value">{active_assignments}</span>
          <span className="stat-label">Active Assignments</span>
        </div>
        <div className="stat-card">
          <span data-field="avg_completion" className="stat-value">{avg_completion}</span>
          <span className="stat-label">Avg Completion</span>
        </div>
      </div>
      <button data-cta-id="view-classes" data-action="navigate" data-target="/teacher/classes" className="btn-secondary" onClick={() => nav("/teacher/classes")} type="button">
        View All Classes
      </button>
    </section>

    
    <section className="card">
      <h2>⚡ Quick Actions</h2>
      <div className="action-grid">
        <button data-cta-id="create-assignment" data-action="navigate" data-target="/teacher/control" className="action-btn" onClick={() => nav("/teacher/control")} type="button">
          ➕ New Assignment
        </button>
        <button data-cta-id="view-analytics" data-action="navigate" data-target="/teacher/analytics" className="action-btn" onClick={() => nav("/teacher/analytics")} type="button">
          📈 Analytics
        </button>
        <button data-cta-id="view-gradebook" data-action="navigate" data-target="/gradebook" className="action-btn" onClick={() => nav("/gradebook")} type="button">
          📝 Gradebook
        </button>
      </div>
    </section>

    
    <section className="card">
      <h2>⚠️ Needs Attention</h2>
      <ul data-list="struggling_students" className="attention-list">
        {strugglingStudents.map((student) => (
          <li key={student.id} className="attention-item">
            <span data-field="student_name">{student.name}</span>
            <span data-field="issue" className="badge badge-warning">{student.issue}</span>
            <button data-cta-id="view-student" data-action="navigate" onClick={() => nav(`/teacher/students/${student.id}`)} type="button">
              View →
            </button>
          </li>
        ))}
      </ul>
    </section>

    
    <section className="card">
      <h2>📋 Recent Submissions</h2>
      <ul data-list="recent_submissions" className="activity-list">
        {recentSubmissions.map((sub, idx) => (
          <li key={idx} className="activity-item">
            <span data-field="student_name">{sub.studentName}</span>
            {" completed "}
            <span data-field="assignment_title">{sub.assignmentTitle}</span>
            <span className="badge badge-success">{sub.score}%</span>
          </li>
        ))}
      </ul>
    </section>
  </main>

    </div>
  );
}
