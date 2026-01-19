
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function PlaySession() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [current_item, setCurrent_item] = React.useState("");
  const [total_items, setTotal_items] = React.useState("");
  const [elapsed_time, setElapsed_time] = React.useState("");
  const [question_text, setQuestion_text] = React.useState("");
  const [stimulus, setStimulus] = React.useState("");
  const [option_0, setOption_0] = React.useState("");
  const [option_1, setOption_1] = React.useState("");
  const [option_2, setOption_2] = React.useState("");
  const [option_3, setOption_3] = React.useState("");
  const [feedback_icon, setFeedback_icon] = React.useState("");
  const [feedback_text, setFeedback_text] = React.useState("");
  const [explanation, setExplanation] = React.useState("");
  const [progress_percent, setProgress_percent] = React.useState("");
  const [score, setScore] = React.useState("");

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
      
      
      <div data-field="stimulus" className="stimulus">{stimulus}</div>
    </section>

    
    <section data-form-id="answer-form" className="options-grid">
      <button data-cta-id="select-option-0" data-action="ui" data-field="option_0" className="option-btn" onClick={() => toast.info("Action: select-option-0")} type="button">{option_0}</button>
      <button data-cta-id="select-option-1" data-action="ui" data-field="option_1" className="option-btn" onClick={() => toast.info("Action: select-option-1")} type="button">{option_1}</button>
      <button data-cta-id="select-option-2" data-action="ui" data-field="option_2" className="option-btn" onClick={() => toast.info("Action: select-option-2")} type="button">{option_2}</button>
      <button data-cta-id="select-option-3" data-action="ui" data-field="option_3" className="option-btn" onClick={() => toast.info("Action: select-option-3")} type="button">{option_3}</button>
    </section>

    
    <section data-state="hidden" className="feedback-card">
      <div data-field="feedback_icon" className="feedback-icon">{feedback_icon}</div>
      <div data-field="feedback_text" className="feedback-text">{feedback_text}</div>
      <div data-field="explanation" className="explanation">{explanation}</div>
      <button data-cta-id="next-question" data-action="ui" className="btn-primary" onClick={() => toast.info("Action: next-question")} type="button">
        Next Question →
      </button>
    </section>

    
    <button data-cta-id="submit-answer" data-action="ui" className="btn-primary btn-large submit-btn" onClick={() => toast.info("Action: submit-answer")} type="button">
      Submit Answer
    </button>
  </main>

  
  <footer className="play-footer">
    <div className="progress-bar full-width">
      <div data-field="progress_percent" style={{ "width": "10%" }} className="progress-fill">{progress_percent}</div>
    </div>
    <div className="score-display">
      Score: <span data-field="score">{score}</span>
    </div>
  </footer>

    </div>
  );
}
