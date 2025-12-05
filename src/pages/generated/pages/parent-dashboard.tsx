
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

interface Child {
  id: string;
  name: string;
  minutesThisWeek: number;
  sessionsThisWeek: number;
  avgAccuracy: number;
  currentMinutes: number;
  weeklyGoalMinutes: number;
}

interface Subject {
  name: string;
  masteryPercent: number;
}

export default function ParentDashboard() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const result = await mcp.listRecords("learner-profile", 10);
        const profiles = (result as { records?: { id: string; fullName: string; currentMinutes?: number; weeklyGoalMinutes?: number; averageAccuracy?: number; totalSessions?: number }[] })?.records || [];
        
        const childData: Child[] = profiles.map(p => ({
          id: p.id,
          name: p.fullName || "Child",
          minutesThisWeek: p.currentMinutes || 45,
          sessionsThisWeek: p.totalSessions || 8,
          avgAccuracy: p.averageAccuracy || 78,
          currentMinutes: p.currentMinutes || 45,
          weeklyGoalMinutes: p.weeklyGoalMinutes || 60,
        }));
        
        if (childData.length === 0) {
          childData.push({ id: "demo", name: "Demo Child", minutesThisWeek: 45, sessionsThisWeek: 8, avgAccuracy: 78, currentMinutes: 45, weeklyGoalMinutes: 60 });
        }
        
        setChildren(childData);
        setSelectedChild(childData[0]);
        setSubjects([{ name: "Math", masteryPercent: 85 }, { name: "Reading", masteryPercent: 72 }]);
      } catch {
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const child_name = selectedChild?.name || "Loading...";
  const minutes_this_week = selectedChild?.minutesThisWeek || 0;
  const sessions_this_week = selectedChild?.sessionsThisWeek || 0;
  const avg_accuracy = `${selectedChild?.avgAccuracy || 0}%`;
  const current_minutes = selectedChild?.currentMinutes || 0;
  const weekly_goal_minutes = selectedChild?.weeklyGoalMinutes || 60;
  const goal_progress = weekly_goal_minutes > 0 ? Math.round((current_minutes / weekly_goal_minutes) * 100) : 0;
  const goal_status = goal_progress >= 100 ? "Goal Met! 🎉" : `${goal_progress}% complete`;

  return (
    <div className="p-6">
      
  <header className="header">
    <h1>👪 Parent Dashboard</h1>
    <button data-cta-id="settings" data-action="navigate" data-target="/settings" onClick={() => nav("/settings")} type="button">⚙️</button>
  </header>

  <main className="container">
    
    <section className="card">
      <h2>👧 My Children</h2>
      <div data-list="children" className="child-selector" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {children.map(child => (
          <button 
            key={child.id}
            data-field="child_name" 
            className={`child-chip ${selectedChild?.id === child.id ? "active" : ""}`}
            onClick={() => setSelectedChild(child)}
            style={{ padding: "0.5rem 1rem", borderRadius: "1rem", border: selectedChild?.id === child.id ? "2px solid var(--color-primary)" : "1px solid var(--color-border)", background: selectedChild?.id === child.id ? "var(--color-primary-light)" : "var(--color-bg)" }}
          >
            {child.name}
          </button>
        ))}
      </div>
    </section>

    
    <section className="card">
      <h2>📊 This Week</h2>
      <div className="stats-row">
        <div className="stat-card">
          <span data-field="minutes_this_week" className="stat-value">{minutes_this_week}</span>
          <span className="stat-label">Minutes</span>
        </div>
        <div className="stat-card">
          <span data-field="sessions_this_week" className="stat-value">{sessions_this_week}</span>
          <span className="stat-label">Sessions</span>
        </div>
        <div className="stat-card">
          <span data-field="avg_accuracy" className="stat-value">{avg_accuracy}</span>
          <span className="stat-label">Accuracy</span>
        </div>
      </div>
    </section>

    
    <section className="card">
      <h2>🎯 Weekly Goal</h2>
      <div className="goal-progress">
        <div className="progress-bar">
          <div style={{ width: `${Math.min(100, goal_progress)}%` }} className="progress-fill"></div>
        </div>
        <p>
          <span data-field="current_minutes">{current_minutes}</span> / 
          <span data-field="weekly_goal_minutes">{weekly_goal_minutes}</span> minutes
        </p>
        <span data-field="goal_status" className="badge badge-success">{goal_status}</span>
      </div>
      <button data-cta-id="view-goals" data-action="navigate" data-target="/parent/goals" className="btn-secondary" onClick={() => nav("/parent/goals")} type="button">
        Manage Goals
      </button>
    </section>

    
    <section className="card">
      <h2>📚 Subjects</h2>
      <ul data-list="subjects" className="subject-list">
        {subjects.map((subj, idx) => (
          <li key={idx} className="subject-item">
            <span data-field="subject_name">{subj.name}</span>
            <div className="mini-progress">
              <div style={{ width: `${subj.masteryPercent}%` }} className="progress-fill"></div>
            </div>
            <span data-field="mastery_percent">{subj.masteryPercent}%</span>
          </li>
        ))}
      </ul>
      <button data-cta-id="view-subjects" data-action="navigate" data-target="/parent/subjects" className="btn-secondary" onClick={() => nav("/parent/subjects")} type="button">
        View All Subjects
      </button>
    </section>

    
    <section className="card">
      <h2>📅 Recent Activity</h2>
      <ul data-list="recent_activity" className="timeline">
        <li className="timeline-item">
          <span className="time">Today 3:30 PM</span>
          <span className="activity">Completed <strong>Multiplication Quiz</strong></span>
          <span className="badge badge-success">92%</span>
        </li>
      </ul>
      <button data-cta-id="view-timeline" data-action="navigate" data-target="/parent/timeline" className="btn-secondary" onClick={() => nav("/parent/timeline")} type="button">
        View Full Timeline
      </button>
    </section>
  </main>

    </div>
  );
}
