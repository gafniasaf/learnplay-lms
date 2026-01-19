
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function PlayResults() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [assignment_title, setAssignment_title] = React.useState("");
  const [score, setScore] = React.useState("");
  const [total_items, setTotal_items] = React.useState("");
  const [accuracy_percent, setAccuracy_percent] = React.useState("");
  const [elapsed_time, setElapsed_time] = React.useState("");
  const [correct_count, setCorrect_count] = React.useState("");
  const [mistakes, setMistakes] = React.useState("");
  const [streak_days, setStreak_days] = React.useState("");
  const [goal_progress, setGoal_progress] = React.useState("");
  const [minutes_today, setMinutes_today] = React.useState("");
  const [minutes_remaining, setMinutes_remaining] = React.useState("");

  return (
    <div className="p-6">
      
  <main className="results-container">
    
    <header className="results-header">
      <div className="celebration-icon">🎉</div>
      <h1>Session Complete!</h1>
      <p data-field="assignment_title">{assignment_title}</p>
    </header>

    
    <section className="results-card score-card">
      <div className="big-score">
        <span data-field="score">{score}</span>
        <span className="score-divider">/</span>
        <span data-field="total_items">{total_items}</span>
      </div>
      <p className="accuracy">
        <span data-field="accuracy_percent">{accuracy_percent}</span> Accuracy
      </p>
    </section>

    
    <section className="stats-grid">
      <div className="stat-item">
        <span className="stat-icon">⏱️</span>
        <span data-field="elapsed_time" className="stat-value">{elapsed_time}</span>
        <span className="stat-label">Time</span>
      </div>
      <div className="stat-item">
        <span className="stat-icon">✅</span>
        <span data-field="correct_count" className="stat-value">{correct_count}</span>
        <span className="stat-label">Correct</span>
      </div>
      <div className="stat-item">
        <span className="stat-icon">❌</span>
        <span data-field="mistakes" className="stat-value">{mistakes}</span>
        <span className="stat-label">Mistakes</span>
      </div>
      <div className="stat-item">
        <span className="stat-icon">🔥</span>
        <span data-field="streak_days" className="stat-value">{streak_days}</span>
        <span className="stat-label">Day Streak</span>
      </div>
    </section>

    
    <section className="results-card goal-update">
      <h3>Weekly Goal Progress</h3>
      <div className="progress-bar">
        <div data-field="goal_progress" style={{ "width": "75%" }} className="progress-fill">{goal_progress}</div>
      </div>
      <p>
        <span data-field="minutes_today">{minutes_today}</span> minutes added • 
        <span data-field="minutes_remaining">{minutes_remaining}</span> minutes to goal
      </p>
    </section>

    
    <section className="results-actions">
      <button data-cta-id="play-again" data-action="navigate" data-target="/play" className="btn-primary btn-large" onClick={() => nav("/play")} type="button">
        🔄 Play Again
      </button>
      <button data-cta-id="back-dashboard" data-action="navigate" data-target="/student/dashboard" className="btn-secondary" onClick={() => nav("/student/dashboard")} type="button">
        🏠 Back to Dashboard
      </button>
    </section>
  </main>

    </div>
  );
}
