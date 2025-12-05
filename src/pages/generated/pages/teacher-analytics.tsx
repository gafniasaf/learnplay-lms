
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function TeacherAnalytics() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [period, setPeriod] = React.useState("");
  const [classFilter, setClassFilter] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/teacher/dashboard" className="btn-ghost" onClick={() => nav("/teacher/dashboard")} type="button">← Back</button>
    <h1>Analytics</h1>
    <div></div>
  </header>
  
  <div className="container">
    <div className="date-range">
      <select data-field="period" value={period} onChange={(e) => setPeriod(e.target.value)}>
        <option value="week">This Week</option>
        <option value="month">This Month</option>
        <option value="quarter">This Quarter</option>
      </select>
      <select data-field="class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
        <option value="">All Classes</option>
        <option value="mth501">5th Grade Math - P1</option>
        <option value="mth503">5th Grade Math - P3</option>
      </select>
    </div>
    
    <div className="metric-grid">
      <div className="metric-card">
        <div style={{ "color": "var(--color-primary)" }} className="metric-value">78%</div>
        <div className="metric-label">Avg. Accuracy</div>
        <div className="metric-change positive">↑ 5% from last week</div>
      </div>
      <div className="metric-card">
        <div style={{ "color": "var(--color-success)" }} className="metric-value">142</div>
        <div className="metric-label">Sessions</div>
        <div className="metric-change positive">↑ 12 from last week</div>
      </div>
      <div className="metric-card">
        <div style={{ "color": "var(--color-secondary)" }} className="metric-value">8.5</div>
        <div className="metric-label">Avg. Time (min)</div>
        <div className="metric-change negative">↓ 0.5 from last week</div>
      </div>
      <div className="metric-card">
        <div style={{ "color": "var(--color-warning)" }} className="metric-value">85%</div>
        <div className="metric-label">Goal Completion</div>
        <div className="metric-change positive">↑ 3% from last week</div>
      </div>
    </div>
    
    <div className="chart-card">
      <div className="chart-header">
        <h3>Progress Over Time</h3>
        <select style={{ "padding": "0.25rem 0.5rem", "borderRadius": "4px", "border": "1px solid var(--color-border)" }}>
          <option>Accuracy</option>
          <option>Sessions</option>
          <option>Time Spent</option>
        </select>
      </div>
      <div className="chart-placeholder">
        📊 Chart: Average accuracy trending up from 72% to 78% over 4 weeks
      </div>
    </div>
    
    <div style={{ "display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "1rem" }}>
      <div className="chart-card">
        <h3 style={{ "marginBottom": "1rem" }}>Subject Breakdown</h3>
        <div style={{ "height": "150px" }} className="chart-placeholder">
          🥧 Pie Chart: Math 45%, Science 30%, English 25%
        </div>
      </div>
      
      <div className="chart-card">
        <h3 style={{ "marginBottom": "1rem" }}>Top Performers</h3>
        <ul className="leaderboard">
          <li className="leaderboard-item">
            <span className="leaderboard-rank gold">1</span>
            <span style={{ "flex": "1" }}>Olivia Davis</span>
            <span style={{ "fontWeight": "600" }}>94%</span>
          </li>
          <li className="leaderboard-item">
            <span className="leaderboard-rank silver">2</span>
            <span style={{ "flex": "1" }}>Emma Johnson</span>
            <span style={{ "fontWeight": "600" }}>88%</span>
          </li>
          <li className="leaderboard-item">
            <span className="leaderboard-rank bronze">3</span>
            <span style={{ "flex": "1" }}>Aiden Brown</span>
            <span style={{ "fontWeight": "600" }}>85%</span>
          </li>
        </ul>
      </div>
    </div>
  </div>

    </div>
  );
}
