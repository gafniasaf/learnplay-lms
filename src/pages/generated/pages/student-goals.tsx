
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function StudentGoals() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [weekly_goal_minutes, setWeekly_goal_minutes] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">← Back</button>
    <h1>My Goals</h1>
    <button data-cta-id="edit-goal" data-action="navigate" data-target="/student/goals/edit" className="btn-ghost" onClick={() => nav("/student/goals/edit")} type="button">Edit</button>
  </header>
  
  <div className="container">
    <div className="goal-card">
      <div className="goal-header">
        <div className="goal-title">Weekly Study Goal</div>
        <span data-field="weekly_goal_minutes" className="goal-progress-text">{weekly_goal_minutes}</span>
      </div>
      <div className="goal-bar">
        <div style={{ "width": "75%" }} className="goal-bar-fill"></div>
      </div>
      <div className="goal-meta">
        <span>15 minutes to go!</span>
        <span>Resets Sunday</span>
      </div>
    </div>
    
    <div className="card">
      <h2>This Week</h2>
      <div className="week-grid">
        <div className="day-cell completed">M<br />✓</div>
        <div className="day-cell completed">T<br />✓</div>
        <div className="day-cell partial">W<br />½</div>
        <div className="day-cell completed">T<br />✓</div>
        <div className="day-cell today">F<br />—</div>
        <div className="day-cell">S<br />—</div>
        <div className="day-cell">S<br />—</div>
      </div>
      <p style={{ "textAlign": "center", "color": "var(--color-text-muted)", "fontSize": "0.875rem" }}>
        4 days active this week • 2 days remaining
      </p>
    </div>
    
    <div className="card">
      <h2>History</h2>
      <ul className="history-list">
        <li className="history-item">
          <span className="badge badge-success">✓</span>
          <div className="history-stats">
            <div className="history-week">Nov 25 - Dec 1</div>
            <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>62 minutes • Goal met!</div>
          </div>
        </li>
        <li className="history-item">
          <span className="badge badge-warning">—</span>
          <div className="history-stats">
            <div className="history-week">Nov 18 - Nov 24</div>
            <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>45 minutes • 75% of goal</div>
          </div>
        </li>
        <li className="history-item">
          <span className="badge badge-success">✓</span>
          <div className="history-stats">
            <div className="history-week">Nov 11 - Nov 17</div>
            <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>68 minutes • Goal met!</div>
          </div>
        </li>
      </ul>
    </div>
    
    <button style={{ "width": "100%" }} data-cta-id="practice-now" data-action="navigate" data-target="/play/welcome" className="btn-primary btn-large" onClick={() => nav("/play/welcome")} type="button">
      Practice Now 🚀
    </button>
  </div>

    </div>
  );
}
