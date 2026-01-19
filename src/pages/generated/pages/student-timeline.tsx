
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function StudentTimeline() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">← Back</button>
    <h1>Activity</h1>
    <div></div>
  </header>
  
  <div className="container timeline-container">
    <div className="timeline-day">
      <div className="day-header">Today</div>
      
      <div className="timeline-item">
        <div className="timeline-icon session">📚</div>
        <div className="timeline-content">
          <div className="timeline-title">Completed Fractions Practice</div>
          <div className="timeline-meta">Math • Score: 8/10 (80%)</div>
        </div>
        <div className="timeline-time">2:30 PM</div>
      </div>
      
      <div className="timeline-item">
        <div className="timeline-icon goal">🎯</div>
        <div className="timeline-content">
          <div className="timeline-title">Weekly goal progress</div>
          <div className="timeline-meta">45/60 minutes completed</div>
        </div>
        <div className="timeline-time">2:30 PM</div>
      </div>
    </div>
    
    <div className="timeline-day">
      <div className="day-header">Yesterday</div>
      
      <div className="timeline-item">
        <div className="timeline-icon badge">🏆</div>
        <div className="timeline-content">
          <div className="timeline-title">Earned "Perfect Score" badge</div>
          <div className="timeline-meta">100% on Multiplication Tables</div>
        </div>
        <div className="timeline-time">4:15 PM</div>
      </div>
      
      <div className="timeline-item">
        <div className="timeline-icon session">📚</div>
        <div className="timeline-content">
          <div className="timeline-title">Completed Multiplication Tables</div>
          <div className="timeline-meta">Math • Score: 12/12 (100%)</div>
        </div>
        <div className="timeline-time">4:15 PM</div>
      </div>
      
      <div className="timeline-item">
        <div className="timeline-icon session">📚</div>
        <div className="timeline-content">
          <div className="timeline-title">Started Reading Comprehension</div>
          <div className="timeline-meta">English • 2/8 questions</div>
        </div>
        <div className="timeline-time">3:00 PM</div>
      </div>
    </div>
    
    <div className="timeline-day">
      <div className="day-header">December 3</div>
      
      <div className="timeline-item">
        <div className="timeline-icon goal">⭐</div>
        <div className="timeline-content">
          <div className="timeline-title">Met weekly goal!</div>
          <div className="timeline-meta">62 minutes this week</div>
        </div>
        <div className="timeline-time">5:00 PM</div>
      </div>
      
      <div className="timeline-item">
        <div className="timeline-icon session">📚</div>
        <div className="timeline-content">
          <div className="timeline-title">Completed Cell Biology Quiz</div>
          <div className="timeline-meta">Science • Score: 7/10 (70%)</div>
        </div>
        <div className="timeline-time">4:30 PM</div>
      </div>
    </div>
  </div>

    </div>
  );
}
