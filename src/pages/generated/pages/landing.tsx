
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
      
  
  <header className="header">
    <a href="/" className="header-brand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"></path>
      </svg>
      LearnPlay
    </a>
    <div className="header-actions">
      <span className="mock-badge">Mock</span>
      <button data-cta-id="nav-menu" data-action="toggle-menu" className="menu-btn" onClick={() => toast.info("Action: nav-menu")} type="button">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
    </div>
  </header>

  
  <main className="page-container">
    <div className="main-content">
      
      <section className="hero">
        <h1 className="hero-title">Welcome to LearnPlay</h1>
        <p className="hero-subtitle">Choose your portal to get started</p>
      </section>

      
      <div className="portal-grid">
        <a href="/student/dashboard" data-cta-id="portal-kid" data-action="navigate" data-target="/student/dashboard" className="portal-card" onClick={() => nav("/student/dashboard")}>
          <div className="portal-card-icon">🎮</div>
          <h2 className="portal-card-title">Kid</h2>
          <p className="portal-card-desc">Fun games and interactive learning</p>
        </a>

        <a href="/parent/dashboard" data-cta-id="portal-parent" data-action="navigate" data-target="/parent/dashboard" className="portal-card" onClick={() => nav("/parent/dashboard")}>
          <div className="portal-card-icon">👪</div>
          <h2 className="portal-card-title">Parent</h2>
          <p className="portal-card-desc">Track progress and support learning</p>
        </a>

        <a href="/teacher/dashboard" data-cta-id="portal-school" data-action="navigate" data-target="/teacher/dashboard" className="portal-card" onClick={() => nav("/teacher/dashboard")}>
          <div className="portal-card-icon">🏫</div>
          <h2 className="portal-card-title">School</h2>
          <p className="portal-card-desc">Manage classes and curriculum</p>
        </a>

        <a href="/admin" data-cta-id="portal-admin" data-action="navigate" data-target="/admin" className="portal-card" onClick={() => nav("/admin")}>
          <div className="portal-card-icon">⚙️</div>
          <h2 className="portal-card-title">Admin</h2>
          <p className="portal-card-desc">System administration and settings</p>
        </a>
      </div>
    </div>

    
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-section">
          <h3>Portal</h3>
          <ul className="footer-links">
            <li><a href="/student/dashboard">Kid</a></li>
            <li><a href="/parent/dashboard">Parent</a></li>
            <li><a href="/teacher/dashboard">School</a></li>
          </ul>
        </div>
        <div className="footer-section">
          <h3>Resources</h3>
          <ul className="footer-links">
            <li><a href="/courses">Courses</a></li>
            <li><a href="/help">Help</a></li>
            <li><a href="/about">About</a></li>
          </ul>
        </div>
        <div className="footer-section">
          <h3>Legal</h3>
          <ul className="footer-links">
            <li><a href="/privacy">Privacy</a></li>
            <li><a href="/terms">Terms</a></li>
          </ul>
        </div>
      </div>
    </footer>
  </main>

    </div>
  );
}
