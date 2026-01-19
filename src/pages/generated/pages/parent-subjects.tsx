
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function ParentSubjects() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/parent/dashboard" className="btn-ghost" onClick={() => nav("/parent/dashboard")} type="button">← Back</button>
    <h1>Subjects</h1>
    <div></div>
  </header>
  
  <div className="container">
    <div className="subject-card">
      <div className="subject-header">
        <div className="subject-icon subject-math">📐</div>
        <div className="subject-info">
          <div className="subject-name">Mathematics</div>
          <div className="subject-progress">12 skills • 8 mastered</div>
        </div>
        <div style={{ "color": "var(--color-primary)" }} className="subject-score">78%</div>
        <span className="trend-up">↑ 5%</span>
      </div>
      <div className="subject-body">
        <div className="skill-item">
          <span className="skill-name">Fractions</span>
          <div className="skill-bar"><div style={{ "width": "85%" }} className="progress-fill"></div></div>
          <span style={{ "fontWeight": "500" }}>85%</span>
        </div>
        <div className="skill-item">
          <span className="skill-name">Decimals</span>
          <div className="skill-bar"><div style={{ "width": "72%" }} className="progress-fill"></div></div>
          <span style={{ "fontWeight": "500" }}>72%</span>
        </div>
        <div className="skill-item">
          <span className="skill-name">Percentages</span>
          <div className="skill-bar"><div style={{ "width": "68%" }} className="progress-fill"></div></div>
          <span style={{ "fontWeight": "500" }}>68%</span>
        </div>
        <div className="skill-item">
          <span className="skill-name">Word Problems</span>
          <div className="skill-bar"><div style={{ "width": "55%", "background": "var(--color-warning)" }} className="progress-fill"></div></div>
          <span style={{ "fontWeight": "500", "color": "var(--color-warning)" }}>55%</span>
        </div>
      </div>
    </div>
    
    <div className="subject-card">
      <div className="subject-header">
        <div className="subject-icon subject-science">🔬</div>
        <div className="subject-info">
          <div className="subject-name">Science</div>
          <div className="subject-progress">8 skills • 5 mastered</div>
        </div>
        <div style={{ "color": "var(--color-success)" }} className="subject-score">82%</div>
        <span className="trend-up">↑ 3%</span>
      </div>
      <div className="subject-body">
        <div className="skill-item">
          <span className="skill-name">Cell Biology</span>
          <div className="skill-bar"><div style={{ "width": "90%" }} className="progress-fill"></div></div>
          <span style={{ "fontWeight": "500" }}>90%</span>
        </div>
        <div className="skill-item">
          <span className="skill-name">Ecosystems</span>
          <div className="skill-bar"><div style={{ "width": "78%" }} className="progress-fill"></div></div>
          <span style={{ "fontWeight": "500" }}>78%</span>
        </div>
        <div className="skill-item">
          <span className="skill-name">Matter & Energy</span>
          <div className="skill-bar"><div style={{ "width": "75%" }} className="progress-fill"></div></div>
          <span style={{ "fontWeight": "500" }}>75%</span>
        </div>
      </div>
    </div>
    
    <div className="subject-card">
      <div className="subject-header">
        <div className="subject-icon subject-english">📖</div>
        <div className="subject-info">
          <div className="subject-name">English</div>
          <div className="subject-progress">10 skills • 4 mastered</div>
        </div>
        <div style={{ "color": "var(--color-warning)" }} className="subject-score">65%</div>
        <span className="trend-down">↓ 2%</span>
      </div>
      <div className="subject-body">
        <div className="skill-item">
          <span className="skill-name">Reading Comprehension</span>
          <div className="skill-bar"><div style={{ "width": "62%", "background": "var(--color-warning)" }} className="progress-fill"></div></div>
          <span style={{ "fontWeight": "500", "color": "var(--color-warning)" }}>62%</span>
        </div>
        <div className="skill-item">
          <span className="skill-name">Vocabulary</span>
          <div className="skill-bar"><div style={{ "width": "70%" }} className="progress-fill"></div></div>
          <span style={{ "fontWeight": "500" }}>70%</span>
        </div>
        <div className="skill-item">
          <span className="skill-name">Grammar</span>
          <div className="skill-bar"><div style={{ "width": "58%", "background": "var(--color-warning)" }} className="progress-fill"></div></div>
          <span style={{ "fontWeight": "500", "color": "var(--color-warning)" }}>58%</span>
        </div>
      </div>
    </div>
  </div>

    </div>
  );
}
