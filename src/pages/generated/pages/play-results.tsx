
import React, { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";
import { useGameStateStore } from "@/store/gameState";

export default function PlayResults() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const logged = useRef(false);
  
  // Wire to existing game state store
  const { course, score, mistakes, poolSize, elapsedTime, reset } = useGameStateStore();
  
  // Log session event on mount (once)
  useEffect(() => {
    if (!course || logged.current) return;
    logged.current = true;
    
    const sessionEvent = {
      courseId: course.id,
      score,
      mistakes,
      totalItems: poolSize,
      elapsedTime,
      completedAt: new Date().toISOString(),
    };
    
    mcp.saveRecord("session-event", sessionEvent)
      .then(() => toast.success("Session saved!"))
      .catch(() => toast.error("Failed to save session"));
  }, [course, score, mistakes, poolSize, elapsedTime]);

  // Computed values from store
  const assignment_title = course?.title || "Practice Session";
  const total_items = poolSize;
  const accuracy_percent = poolSize > 0 ? Math.round((score / poolSize) * 100) : 0;
  const elapsed_time = `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, "0")}`;
  const correct_count = score;
  const streak_days = 3; // TODO: fetch from profile
  const goal_progress = Math.min(100, accuracy_percent + 25);
  const minutes_today = Math.ceil(elapsedTime / 60);
  const minutes_remaining = Math.max(0, 30 - minutes_today);
  
  const handlePlayAgain = () => {
    reset();
    nav("/play/welcome");
  };

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
      <button data-cta-id="play-again" data-action="navigate" data-target="/play/welcome" className="btn-primary btn-large" onClick={handlePlayAgain} type="button">
        🔄 Play Again
      </button>
      <button data-cta-id="back-dashboard" data-action="navigate" data-target="/student/dashboard" className="btn-secondary" onClick={() => { reset(); nav("/student/dashboard"); }} type="button">
        🏠 Back to Dashboard
      </button>
    </section>
  </main>

    </div>
  );
}
