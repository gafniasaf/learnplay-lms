
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function TeacherDashboard() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [total_students, setTotal_students] = React.useState("");
  const [active_assignments, setActive_assignments] = React.useState("");
  const [avg_completion, setAvg_completion] = React.useState("");
  const [student_name, setStudent_name] = React.useState("");
  const [issue, setIssue] = React.useState("");
  const [assignment_title, setAssignment_title] = React.useState("");

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
        <li className="attention-item">
          <span data-field="student_name">{student_name}</span>
          <span data-field="issue" className="badge badge-warning">{issue}</span>
          <button data-cta-id="view-student" data-action="navigate" data-target="/teacher/students/{id}" onClick={() => nav("/teacher/students/{id}")} type="button">
            View →
          </button>
        </li>
      </ul>
    </section>

    
    <section className="card">
      <h2>📋 Recent Submissions</h2>
      <ul data-list="recent_submissions" className="activity-list">
        <li className="activity-item">
          <span data-field="student_name">Sam K.</span>
          completed
          <span data-field="assignment_title">{assignment_title}</span>
          <span className="badge badge-success">92%</span>
        </li>
      </ul>
    </section>
  </main>

    </div>
  );
}
