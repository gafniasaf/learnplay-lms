
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function StudentAchievements() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">← Back</button>
    <h1>Achievements</h1>
    <div></div>
  </header>
  
  <div className="container">
    <div className="level-progress">
      <div className="level-header">
        <div>
          <span className="level-badge">⭐</span>
          <span style={{ "fontSize": "1.25rem", "fontWeight": "600" }}>Level 12</span>
        </div>
        <span className="badge badge-info">Rising Star</span>
      </div>
      <div className="progress-bar">
        <div style={{ "width": "65%" }} className="progress-fill"></div>
      </div>
      <p className="xp-text">1,250 / 2,000 XP to next level</p>
    </div>
    
    <h2 style={{ "marginBottom": "1rem" }}>Earned (8)</h2>
    <div style={{ "marginBottom": "2rem" }} className="achievement-grid">
      <div className="achievement-card">
        <div className="achievement-icon">🏆</div>
        <div className="achievement-name">First Steps</div>
        <div className="achievement-desc">Complete your first session</div>
        <div className="achievement-date">Dec 1, 2024</div>
      </div>
      <div className="achievement-card">
        <div className="achievement-icon">🔥</div>
        <div className="achievement-name">On Fire</div>
        <div className="achievement-desc">5-day streak</div>
        <div className="achievement-date">Dec 3, 2024</div>
      </div>
      <div className="achievement-card">
        <div className="achievement-icon">💯</div>
        <div className="achievement-name">Perfect Score</div>
        <div className="achievement-desc">100% on a session</div>
        <div className="achievement-date">Dec 2, 2024</div>
      </div>
      <div className="achievement-card">
        <div className="achievement-icon">📚</div>
        <div className="achievement-name">Bookworm</div>
        <div className="achievement-desc">Complete 10 sessions</div>
        <div className="achievement-date">Dec 4, 2024</div>
      </div>
    </div>
    
    <h2 style={{ "marginBottom": "1rem" }}>Locked</h2>
    <div className="achievement-grid">
      <div className="achievement-card locked">
        <div className="achievement-icon">🌟</div>
        <div className="achievement-name">Weekly Champion</div>
        <div className="achievement-desc">Complete all weekly goals</div>
      </div>
      <div className="achievement-card locked">
        <div className="achievement-icon">🚀</div>
        <div className="achievement-name">Speed Demon</div>
        <div className="achievement-desc">Finish under 5 minutes</div>
      </div>
      <div className="achievement-card locked">
        <div className="achievement-icon">🎯</div>
        <div className="achievement-name">Sharpshooter</div>
        <div className="achievement-desc">10 correct in a row</div>
      </div>
    </div>
  </div>

    </div>
  );
}
