
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function Landing() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <div className="hero">
    <div className="hero-logo">🎓</div>
    <h1>LearnPlay</h1>
    <p className="hero-tagline">Adaptive learning with multi-role insights</p>
    <div className="hero-actions">
      <button data-cta-id="get-started" data-action="navigate" data-target="/auth" className="btn-hero btn-hero-primary" onClick={() => nav("/auth")} type="button">Get Started</button>
      <button data-cta-id="learn-more" data-action="navigate" data-target="/about" className="btn-hero btn-hero-secondary" onClick={() => nav("/about")} type="button">Learn More</button>
    </div>
  </div>
  
  <div className="features">
    <h2>Why LearnPlay?</h2>
    <div className="feature-grid">
      <div className="feature-card">
        <div className="feature-icon">🎯</div>
        <div className="feature-title">Adaptive Learning</div>
        <p>Questions adjust to each student's level with smart variant rotation.</p>
      </div>
      <div className="feature-card">
        <div className="feature-icon">📊</div>
        <div className="feature-title">Multi-Role Dashboards</div>
        <p>Students, teachers, and parents each get tailored insights.</p>
      </div>
      <div className="feature-card">
        <div className="feature-icon">🤖</div>
        <div className="feature-title">AI-Powered Content</div>
        <p>Generate courses and assignments with intelligent assistance.</p>
      </div>
    </div>
  </div>

    </div>
  );
}
