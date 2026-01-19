
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function StudentAssignments() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [title, setTitle] = React.useState("");
  const [progress, setProgress] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">← Back</button>
    <h1>My Assignments</h1>
    <div></div>
  </header>
  
  <div className="container">
    <div className="filter-tabs">
      <button className="filter-tab active">All (8)</button>
      <button className="filter-tab">In Progress (3)</button>
      <button className="filter-tab">Not Started (2)</button>
      <button className="filter-tab">Completed (3)</button>
    </div>
    
    <div className="assignment-card">
      <div className="assignment-icon">📐</div>
      <div className="assignment-info">
        <div data-field="title" className="assignment-title">{title}</div>
        <div className="assignment-meta">Math • 15 questions</div>
        <div style={{ "marginTop": "0.5rem", "height": "6px" }} className="progress-bar">
          <div data-field="progress" data-format="style-width" style={{ "width": "60%" }} className="progress-fill">{progress}</div>
        </div>
      </div>
      <span className="assignment-due today">Due Today</span>
      <button data-cta-id="continue-assignment" data-action="navigate" data-target="/play" className="btn-primary" onClick={() => nav("/play")} type="button">Continue</button>
    </div>
    
    <div className="assignment-card">
      <div className="assignment-icon">🔬</div>
      <div className="assignment-info">
        <div className="assignment-title">Cell Biology Quiz</div>
        <div className="assignment-meta">Science • 10 questions</div>
      </div>
      <span className="assignment-due overdue">Overdue</span>
      <button data-cta-id="start-assignment" data-action="navigate" data-target="/play" className="btn-primary" onClick={() => nav("/play")} type="button">Start</button>
    </div>
    
    <div className="assignment-card">
      <div className="assignment-icon">📖</div>
      <div className="assignment-info">
        <div className="assignment-title">Reading Comprehension</div>
        <div className="assignment-meta">English • 8 questions</div>
        <div style={{ "marginTop": "0.5rem", "height": "6px" }} className="progress-bar">
          <div style={{ "width": "25%" }} className="progress-fill"></div>
        </div>
      </div>
      <span className="assignment-due upcoming">Due Dec 10</span>
      <button data-cta-id="view-assignment" data-action="navigate" data-target="/play" className="btn-secondary" onClick={() => nav("/play")} type="button">Continue</button>
    </div>
    
    <div style={{ "opacity": "0.7" }} className="assignment-card">
      <div className="assignment-icon">✅</div>
      <div className="assignment-info">
        <div className="assignment-title">Multiplication Tables</div>
        <div className="assignment-meta">Math • Completed Dec 3</div>
      </div>
      <span className="badge badge-success">100%</span>
      <button data-cta-id="review-assignment" data-action="navigate" data-target="/results" className="btn-secondary" onClick={() => nav("/results")} type="button">Review</button>
    </div>
  </div>

    </div>
  );
}
