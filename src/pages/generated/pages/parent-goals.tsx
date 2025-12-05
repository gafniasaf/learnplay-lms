
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function ParentGoals() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/parent/dashboard" className="btn-ghost" onClick={() => nav("/parent/dashboard")} type="button">← Back</button>
    <h1>Emma's Goals</h1>
    <div></div>
  </header>
  
  <div className="container">
    <div className="goal-overview">
      <div className="goal-ring">
        <svg width="150" height="150" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r="60" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="12"></circle>
          <circle cx="75" cy="75" r="60" fill="none" stroke="white" stroke-width="12" 
                  stroke-dasharray="283" stroke-dashoffset="70" stroke-linecap="round"></circle>
        </svg>
        <div className="goal-ring-text">
          <div className="goal-value">45</div>
          <div className="goal-label">of 60 min</div>
        </div>
      </div>
      <h2>This Week's Progress</h2>
      <p style={{ "opacity": "0.9" }}>15 minutes to reach the weekly goal!</p>
    </div>
    
    <div className="week-calendar">
      <div className="calendar-day active">
        <span className="day-name">Mon</span>
        <span className="day-icon">✅</span>
      </div>
      <div className="calendar-day active">
        <span className="day-name">Tue</span>
        <span className="day-icon">✅</span>
      </div>
      <div className="calendar-day partial">
        <span className="day-name">Wed</span>
        <span className="day-icon">⏳</span>
      </div>
      <div className="calendar-day active">
        <span className="day-name">Thu</span>
        <span className="day-icon">✅</span>
      </div>
      <div className="calendar-day today">
        <span className="day-name">Fri</span>
        <span className="day-icon">📅</span>
      </div>
      <div className="calendar-day">
        <span className="day-name">Sat</span>
        <span className="day-icon">—</span>
      </div>
      <div className="calendar-day">
        <span className="day-name">Sun</span>
        <span className="day-icon">—</span>
      </div>
    </div>
    
    <div className="goal-actions">
      <button style={{ "flex": "1" }} data-cta-id="adjust-goal" data-action="save" data-entity="GoalUpdate" className="btn-secondary" onClick={async () => {
            try {
              await mcp.saveRecord("GoalUpdate", { id });
              toast.success("Saved: adjust-goal");
            } catch (e) {
              toast.error("Save failed: adjust-goal");
            }
          }} type="button">
        📝 Adjust Goal
      </button>
      <button style={{ "flex": "1" }} data-cta-id="send-encouragement" data-action="navigate" data-target="/messages" className="btn-primary" onClick={() => nav("/messages")} type="button">
        💬 Send Message
      </button>
    </div>
    
    <h3 style={{ "marginBottom": "1rem" }}>Goal History</h3>
    
    <div className="history-card">
      <div className="history-header">
        <span style={{ "fontWeight": "600" }}>Nov 25 - Dec 1</span>
        <span className="badge badge-success">Goal Met! ✓</span>
      </div>
      <div style={{ "display": "flex", "justifyContent": "space-between", "color": "var(--color-text-muted)", "fontSize": "0.875rem" }}>
        <span>62 / 60 minutes</span>
        <span>5 active days</span>
      </div>
    </div>
    
    <div className="history-card">
      <div className="history-header">
        <span style={{ "fontWeight": "600" }}>Nov 18 - Nov 24</span>
        <span className="badge badge-warning">75%</span>
      </div>
      <div style={{ "display": "flex", "justifyContent": "space-between", "color": "var(--color-text-muted)", "fontSize": "0.875rem" }}>
        <span>45 / 60 minutes</span>
        <span>4 active days</span>
      </div>
    </div>
    
    <div className="history-card">
      <div className="history-header">
        <span style={{ "fontWeight": "600" }}>Nov 11 - Nov 17</span>
        <span className="badge badge-success">Goal Met! ✓</span>
      </div>
      <div style={{ "display": "flex", "justifyContent": "space-between", "color": "var(--color-text-muted)", "fontSize": "0.875rem" }}>
        <span>68 / 60 minutes</span>
        <span>6 active days</span>
      </div>
    </div>
  </div>

    </div>
  );
}
