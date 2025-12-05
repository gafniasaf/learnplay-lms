
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function PlaySessionMedia() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [progress, setProgress] = React.useState("");
  const [score, setScore] = React.useState("");
  const [mediaPanel, setMediaPanel] = React.useState("");
  const [questionText, setQuestionText] = React.useState("");
  const [hint, setHint] = React.useState("");
  const [feedback, setFeedback] = React.useState("");
  const [feedbackText, setFeedbackText] = React.useState("");

  return (
    <div className="p-6">
      
  <div className="play-container">
    <header className="play-header">
      <button data-cta-id="exit-session" data-action="navigate" data-target="/student/dashboard" style={{ "background": "none", "border": "none", "fontSize": "1.25rem", "cursor": "pointer" }} onClick={() => nav("/student/dashboard")} type="button">✕</button>
      <div className="progress-bar">
        <div data-field="progress" style={{ "width": "60%" }} className="progress-fill">{progress}</div>
      </div>
      <span data-field="score">{score}</span>
    </header>
    
    <div className="play-content">
      
      <div data-field="mediaPanel" className="media-panel">{mediaPanel}</div>
      
      
      <div className="question-card">
        <div data-field="questionText" className="question-text">{questionText}</div>
        <div data-field="hint" className="question-hint">{hint}</div>
      </div>
      
      
      <div className="options-grid">
        <button data-cta-id="option-0" data-action="ui" className="option-btn" onClick={() => toast.info("Action: option-0")} type="button">
          <div className="option-text">1/4</div>
        </button>
        <button data-cta-id="option-1" data-action="ui" className="option-btn selected" onClick={() => toast.info("Action: option-1")} type="button">
          <img src="https://placehold.co/200x100/22c55e/white?text=3/4" alt="Three quarters" className="option-media" />
          <div className="option-text">3/4</div>
        </button>
        <button data-cta-id="option-2" data-action="ui" className="option-btn" onClick={() => toast.info("Action: option-2")} type="button">
          <div className="option-text">1/2</div>
        </button>
        <button data-cta-id="option-3" data-action="ui" className="option-btn" onClick={() => toast.info("Action: option-3")} type="button">
          <div className="option-text">1</div>
        </button>
      </div>
      
      
      <div data-field="feedback" style={{ "display": "none" }} className="feedback correct">{feedback}</div>
    </div>
    
    <footer className="play-footer">
      <button data-cta-id="submit-answer" data-action="ui" className="submit-btn" onClick={() => toast.info("Action: submit-answer")} type="button">Submit Answer</button>
    </footer>
  </div>

    </div>
  );
}
