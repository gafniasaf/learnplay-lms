
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function ParentTimeline() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/parent/dashboard" className="btn-ghost" onClick={() => nav("/parent/dashboard")} type="button">← Back</button>
    <h1>Activity</h1>
    <div></div>
  </header>
  
  <div className="container">
    <div className="filter-chips">
      <button className="chip active">All Activity</button>
      <button className="chip">Sessions</button>
      <button className="chip">Achievements</button>
      <button className="chip">Goals</button>
      <button className="chip">Assignments</button>
    </div>
    
    <div className="timeline-section">
      <div className="timeline-date">Today</div>
      
      <div className="timeline-event">
        <div className="event-icon session">📚</div>
        <div className="event-content">
          <div className="event-title">Completed Fractions Practice</div>
          <div className="event-detail">Math • 15 questions in 12 minutes</div>
        </div>
        <span className="event-score score-good">80%</span>
        <div className="event-time">2:30 PM</div>
      </div>
      
      <div className="timeline-event">
        <div className="event-icon goal">🎯</div>
        <div className="event-content">
          <div className="event-title">Weekly goal progress</div>
          <div className="event-detail">45 of 60 minutes completed (75%)</div>
        </div>
        <div className="event-time">2:30 PM</div>
      </div>
    </div>
    
    <div className="timeline-section">
      <div className="timeline-date">Yesterday</div>
      
      <div className="timeline-event">
        <div className="event-icon achievement">🏆</div>
        <div className="event-content">
          <div className="event-title">Earned "Perfect Score" badge!</div>
          <div className="event-detail">100% accuracy on Multiplication Tables</div>
        </div>
        <div className="event-time">4:15 PM</div>
      </div>
      
      <div className="timeline-event">
        <div className="event-icon session">📚</div>
        <div className="event-content">
          <div className="event-title">Completed Multiplication Tables</div>
          <div className="event-detail">Math • 12 questions in 8 minutes</div>
        </div>
        <span className="event-score score-good">100%</span>
        <div className="event-time">4:15 PM</div>
      </div>
      
      <div className="timeline-event">
        <div className="event-icon assignment">📝</div>
        <div className="event-content">
          <div className="event-title">Started Reading Comprehension</div>
          <div className="event-detail">English • 2 of 8 questions answered</div>
        </div>
        <div className="event-time">3:00 PM</div>
      </div>
    </div>
    
    <div className="timeline-section">
      <div className="timeline-date">December 3</div>
      
      <div className="timeline-event">
        <div className="event-icon goal">⭐</div>
        <div className="event-content">
          <div className="event-title">Met weekly goal!</div>
          <div className="event-detail">62 minutes of learning completed</div>
        </div>
        <div className="event-time">5:00 PM</div>
      </div>
      
      <div className="timeline-event">
        <div className="event-icon session">📚</div>
        <div className="event-content">
          <div className="event-title">Completed Cell Biology Quiz</div>
          <div className="event-detail">Science • 10 questions in 14 minutes</div>
        </div>
        <span className="event-score score-ok">70%</span>
        <div className="event-time">4:30 PM</div>
      </div>
    </div>
    
    <button style={{ "width": "100%" }} className="btn-secondary">Load More Activity</button>
  </div>

    </div>
  );
}
