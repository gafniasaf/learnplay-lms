
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function AdminConsole() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [total_users, setTotal_users] = React.useState("");
  const [active_today, setActive_today] = React.useState("");
  const [sessions_today, setSessions_today] = React.useState("");
  const [jobs_completed, setJobs_completed] = React.useState("");
  const [jobs_running, setJobs_running] = React.useState("");
  const [jobs_queued, setJobs_queued] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <h1>🔧 Admin Console</h1>
    <button data-cta-id="settings" data-action="navigate" data-target="/settings" onClick={() => nav("/settings")} type="button">⚙️</button>
  </header>

  <main className="container">
    
    <section className="card">
      <h2>💚 System Health</h2>
      <div className="health-grid">
        <div className="health-item healthy">
          <span className="health-icon">✅</span>
          <span className="health-label">Database</span>
          <span className="health-status">Connected</span>
        </div>
        <div className="health-item healthy">
          <span className="health-icon">✅</span>
          <span className="health-label">Edge Functions</span>
          <span className="health-status">11 Active</span>
        </div>
        <div className="health-item healthy">
          <span className="health-icon">✅</span>
          <span className="health-label">MCP Server</span>
          <span className="health-status">Running</span>
        </div>
        <div className="health-item healthy">
          <span className="health-icon">✅</span>
          <span className="health-label">AI Services</span>
          <span className="health-status">Available</span>
        </div>
      </div>
      <button data-cta-id="view-health" data-action="navigate" data-target="/admin/system-health" className="btn-secondary" onClick={() => nav("/admin/system-health")} type="button">
        View Details
      </button>
    </section>

    
    <section className="card">
      <h2>📊 Platform Stats</h2>
      <div className="stats-row">
        <div className="stat-card">
          <span data-field="total_users" className="stat-value">{total_users}</span>
          <span className="stat-label">Total Users</span>
        </div>
        <div className="stat-card">
          <span data-field="active_today" className="stat-value">{active_today}</span>
          <span className="stat-label">Active Today</span>
        </div>
        <div className="stat-card">
          <span data-field="sessions_today" className="stat-value">{sessions_today}</span>
          <span className="stat-label">Sessions Today</span>
        </div>
      </div>
    </section>

    
    <section className="card">
      <h2>⚙️ AI Job Queue</h2>
      <div className="job-stats">
        <span data-field="jobs_completed" className="badge badge-success">{jobs_completed}</span>
        <span data-field="jobs_running" className="badge badge-info">{jobs_running}</span>
        <span data-field="jobs_queued" className="badge badge-warning">{jobs_queued}</span>
      </div>
      <button data-cta-id="view-jobs" data-action="navigate" data-target="/admin/jobs" className="btn-secondary" onClick={() => nav("/admin/jobs")} type="button">
        View Job Queue
      </button>
    </section>

    
    <section className="card">
      <h2>⚡ Quick Actions</h2>
      <div className="action-grid">
        <button data-cta-id="manage-courses" data-action="navigate" data-target="/catalog-builder" className="action-btn" onClick={() => nav("/catalog-builder")} type="button">
          📚 Manage Courses
        </button>
        <button data-cta-id="view-pipeline" data-action="navigate" data-target="/admin/ai-pipeline" className="action-btn" onClick={() => nav("/admin/ai-pipeline")} type="button">
          🤖 AI Pipeline
        </button>
        <button data-cta-id="view-metrics" data-action="navigate" data-target="/admin/metrics" className="action-btn" onClick={() => nav("/admin/metrics")} type="button">
          📈 Metrics
        </button>
      </div>
    </section>
  </main>

    </div>
  );
}
