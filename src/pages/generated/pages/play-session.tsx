
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";
import { useGameStateStore } from "@/store/gameState";

export default function PlaySession() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  
  // Wire to existing game state store (DO NOT recreate)
  const {
    course,
    currentItem,
    pool,
    poolSize,
    score,
    mistakes,
    elapsedTime,
    isComplete,
    processAnswer,
    advanceToNext,
    incrementTime,
  } = useGameStateStore();

  // Local UI state
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState({ isCorrect: false, correctAnswer: "", explanation: "" });

  // Timer effect
  useEffect(() => {
    if (isComplete) return;
    const timer = setInterval(() => incrementTime(), 1000);
    return () => clearInterval(timer);
  }, [isComplete, incrementTime]);

  // Redirect if no course
  useEffect(() => {
    if (!course) {
      toast.error("No course loaded");
      nav("/play/welcome");
    }
  }, [course, nav]);

  // Navigate to results on complete
  useEffect(() => {
    if (isComplete) {
      setTimeout(() => nav("/results"), 1500);
    }
  }, [isComplete, nav]);

  // Computed values from store
  const current_item = poolSize - pool.length + 1;
  const total_items = poolSize;
  const elapsed_time = `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, "0")}`;
  const question_text = currentItem?.text || "";
  const stimulus = currentItem?.stimulus?.url || "";
  const option_0 = currentItem?.options?.[0] || "";
  const option_1 = currentItem?.options?.[1] || "";
  const option_2 = currentItem?.options?.[2] || "";
  const option_3 = currentItem?.options?.[3] || "";
  const progress_percent = poolSize > 0 ? Math.round(((poolSize - pool.length) / poolSize) * 100) : 0;

  // Handlers
  const handleSelectOption = (index: number) => {
    if (showFeedback) return;
    setSelectedOption(index);
  };

  const handleSubmit = useCallback(() => {
    if (selectedOption === null || !currentItem) return;
    const result = processAnswer(selectedOption);
    setFeedbackData({
      isCorrect: result.isCorrect,
      correctAnswer: result.correctAnswer,
      explanation: currentItem.explain || result.filledSentence,
    });
    setShowFeedback(true);
    if (result.isCorrect) {
      toast.success("Correct! 🎉");
    } else {
      toast.error(`The answer was ${result.correctAnswer}`);
    }
  }, [selectedOption, currentItem, processAnswer]);

  const handleNext = useCallback(() => {
    setShowFeedback(false);
    setSelectedOption(null);
    advanceToNext();
  }, [advanceToNext]);

  return (
    <div className="p-6">
      
  <header className="play-header">
    <button data-cta-id="exit-session" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">
      ✕ Exit
    </button>
    <div className="session-progress">
      <span data-field="current_item">{current_item}</span> / <span data-field="total_items">{total_items}</span>
    </div>
    <div className="session-timer">
      <span data-field="elapsed_time">{elapsed_time}</span>
    </div>
  </header>

  <main className="play-container">
    
    <section className="question-card">
      <div data-field="question_text" className="question-text">{question_text}</div>
      
      {stimulus && (
        <div data-field="stimulus" className="stimulus">
          <img src={stimulus} alt="Question stimulus" style={{ maxWidth: "100%", maxHeight: "200px" }} />
        </div>
      )}
    </section>

    
    <section data-form-id="answer-form" className="options-grid">
      <button data-cta-id="select-option-0" data-action="ui" className={`option-btn ${selectedOption === 0 ? "selected" : ""} ${showFeedback && currentItem?.correctIndex === 0 ? "correct" : ""} ${showFeedback && selectedOption === 0 && currentItem?.correctIndex !== 0 ? "incorrect" : ""}`} onClick={() => handleSelectOption(0)} type="button" disabled={showFeedback}>{option_0}</button>
      <button data-cta-id="select-option-1" data-action="ui" className={`option-btn ${selectedOption === 1 ? "selected" : ""} ${showFeedback && currentItem?.correctIndex === 1 ? "correct" : ""} ${showFeedback && selectedOption === 1 && currentItem?.correctIndex !== 1 ? "incorrect" : ""}`} onClick={() => handleSelectOption(1)} type="button" disabled={showFeedback}>{option_1}</button>
      <button data-cta-id="select-option-2" data-action="ui" className={`option-btn ${selectedOption === 2 ? "selected" : ""} ${showFeedback && currentItem?.correctIndex === 2 ? "correct" : ""} ${showFeedback && selectedOption === 2 && currentItem?.correctIndex !== 2 ? "incorrect" : ""}`} onClick={() => handleSelectOption(2)} type="button" disabled={showFeedback}>{option_2}</button>
      <button data-cta-id="select-option-3" data-action="ui" className={`option-btn ${selectedOption === 3 ? "selected" : ""} ${showFeedback && currentItem?.correctIndex === 3 ? "correct" : ""} ${showFeedback && selectedOption === 3 && currentItem?.correctIndex !== 3 ? "incorrect" : ""}`} onClick={() => handleSelectOption(3)} type="button" disabled={showFeedback}>{option_3}</button>
    </section>

    {showFeedback && (
    <section className="feedback-card">
      <div data-field="feedback_icon" className="feedback-icon">{feedbackData.isCorrect ? "✅" : "❌"}</div>
      <div data-field="feedback_text" className="feedback-text">{feedbackData.isCorrect ? "Correct!" : `The answer was: ${feedbackData.correctAnswer}`}</div>
      <div data-field="explanation" className="explanation">{feedbackData.explanation}</div>
      <button data-cta-id="next-question" data-action="ui" className="btn-primary" onClick={handleNext} type="button">
        {isComplete ? "View Results 🎉" : "Next Question →"}
      </button>
    </section>
    )}

    {!showFeedback && (
    <button data-cta-id="submit-answer" data-action="ui" className="btn-primary btn-large submit-btn" onClick={handleSubmit} type="button" disabled={selectedOption === null}>
      Submit Answer
    </button>
    )}
  </main>

  
  <footer className="play-footer">
    <div className="progress-bar full-width">
      <div data-field="progress_percent" style={{ width: `${progress_percent}%` }} className="progress-fill"></div>
    </div>
    <div className="score-display">
      Score: <span data-field="score">{score}</span>
    </div>
  </footer>

    </div>
  );
}
