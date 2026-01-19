
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function PlayWelcome() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [title, setTitle] = React.useState("");
  const [subject, setSubject] = React.useState("");

  return (
    <div className="p-6">
      
  <div className="welcome-container">
    <div className="welcome-card">
      <div className="course-icon">📐</div>
      <h1 data-field="title" className="course-title">{title}</h1>
      <p data-field="subject" className="course-meta">{subject}</p>
      
      <div className="session-info">
        <div className="info-row">
          <span className="info-label">Questions</span>
          <span className="info-value">15 items</span>
        </div>
        <div className="info-row">
          <span className="info-label">Est. Time</span>
          <span className="info-value">~10 min</span>
        </div>
        <div className="info-row">
          <span className="info-label">Best Score</span>
          <span className="info-value">87%</span>
        </div>
      </div>
      
      <p style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)", "marginBottom": "0.5rem" }}>Select Level</p>
      <div className="level-selector">
        <button className="level-btn">1</button>
        <button className="level-btn active">2</button>
        <button className="level-btn">3</button>
        <button className="level-btn locked">4</button>
        <button className="level-btn locked">5</button>
      </div>
      
      <button style={{ "width": "100%" }} data-cta-id="start-session" data-action="navigate" data-target="/play" className="btn-primary btn-large" onClick={() => nav("/play")} type="button">
        Start Learning 🚀
      </button>
      
      <button style={{ "marginTop": "1rem" }} data-cta-id="go-back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">
        ← Back to Dashboard
      </button>
    </div>
  </div>

    </div>
  );
}
