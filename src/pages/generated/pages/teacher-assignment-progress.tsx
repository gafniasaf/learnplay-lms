
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function TeacherAssignmentProgress() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [title, setTitle] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/teacher/assignments" className="btn-ghost" onClick={() => nav("/teacher/assignments")} type="button">← Back</button>
    <h1>Assignment Detail</h1>
    <button data-cta-id="edit" data-action="navigate" data-target="/teacher/control" className="btn-ghost" onClick={() => nav("/teacher/control")} type="button">Edit</button>
  </header>
  
  <div className="container">
    <div className="assignment-header">
      <div style={{ "display": "flex", "justifyContent": "space-between", "alignItems": "center" }}>
        <div>
          <div data-field="title" className="assignment-title">{title}</div>
          <div className="assignment-meta">Math • 5th Grade Math P1 • Due Dec 5</div>
        </div>
        <div className="completion-ring">
          <div className="completion-inner">
            <div className="completion-value">75%</div>
            <div style={{ "fontSize": "0.75rem" }}>Complete</div>
          </div>
        </div>
      </div>
    </div>
    
    <div style={{ "marginBottom": "1.5rem" }} className="stats-row">
      <div className="stat-card">
        <span className="stat-value">18</span>
        <span className="stat-label">Completed</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">6</span>
        <span className="stat-label">In Progress</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">82%</span>
        <span className="stat-label">Avg Score</span>
      </div>
    </div>
    
    <div className="question-breakdown">
      <h3 style={{ "marginBottom": "1rem" }}>Question Performance</h3>
      <div className="question-item">
        <div className="question-num">1</div>
        <div className="question-bar">
          <div style={{ "width": "85%" }} className="bar-correct"></div>
          <div style={{ "width": "15%" }} className="bar-incorrect"></div>
        </div>
        <span style={{ "width": "50px", "textAlign": "right", "fontSize": "0.875rem" }}>85%</span>
      </div>
      <div className="question-item">
        <div className="question-num">2</div>
        <div className="question-bar">
          <div style={{ "width": "92%" }} className="bar-correct"></div>
          <div style={{ "width": "8%" }} className="bar-incorrect"></div>
        </div>
        <span style={{ "width": "50px", "textAlign": "right", "fontSize": "0.875rem" }}>92%</span>
      </div>
      <div className="question-item">
        <div className="question-num">3</div>
        <div className="question-bar">
          <div style={{ "width": "45%" }} className="bar-correct"></div>
          <div style={{ "width": "55%" }} className="bar-incorrect"></div>
        </div>
        <span style={{ "width": "50px", "textAlign": "right", "fontSize": "0.875rem", "color": "var(--color-error)" }}>45%</span>
      </div>
      <div className="question-item">
        <div className="question-num">4</div>
        <div className="question-bar">
          <div style={{ "width": "78%" }} className="bar-correct"></div>
          <div style={{ "width": "22%" }} className="bar-incorrect"></div>
        </div>
        <span style={{ "width": "50px", "textAlign": "right", "fontSize": "0.875rem" }}>78%</span>
      </div>
    </div>
    
    <h3 style={{ "marginBottom": "1rem" }}>Recent Submissions</h3>
    <div className="student-submission">
      <div className="submission-avatar">EJ</div>
      <div className="submission-info">
        <div style={{ "fontWeight": "500" }}>Emma Johnson</div>
        <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>Completed 2 hours ago</div>
      </div>
      <span className="badge badge-success">88%</span>
      <button className="btn-ghost">View</button>
    </div>
    <div className="student-submission">
      <div style={{ "background": "linear-gradient(135deg, #22c55e, #06b6d4)" }} className="submission-avatar">LS</div>
      <div className="submission-info">
        <div style={{ "fontWeight": "500" }}>Liam Smith</div>
        <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>In progress • 8/15 questions</div>
      </div>
      <span className="badge badge-warning">In Progress</span>
      <button className="btn-ghost">—</button>
    </div>
    <div className="student-submission">
      <div style={{ "background": "linear-gradient(135deg, #f59e0b, #ef4444)" }} className="submission-avatar">AB</div>
      <div className="submission-info">
        <div style={{ "fontWeight": "500" }}>Aiden Brown</div>
        <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>Completed yesterday</div>
      </div>
      <span className="badge badge-success">92%</span>
      <button className="btn-ghost">View</button>
    </div>
  </div>

    </div>
  );
}
