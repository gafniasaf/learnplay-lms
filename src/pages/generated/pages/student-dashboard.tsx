
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function StudentDashboard() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [streak_days, setStreak_days] = React.useState("");
  const [total_xp, setTotal_xp] = React.useState("");
  const [items_completed, setItems_completed] = React.useState("");
  const [time_practiced, setTime_practiced] = React.useState("");
  const [assignment_title, setAssignment_title] = React.useState("");
  const [assignment_progress, setAssignment_progress] = React.useState("");

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
      <button data-cta-id="nav-menu" className="menu-btn" onClick={() => nav("/")} type="button">
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
      
      <nav className="breadcrumb">
        <a href="/">Home</a>
        <span className="breadcrumb-separator">›</span>
        <a href="/student">Student</a>
        <span className="breadcrumb-separator">›</span>
        <span>Overview</span>
      </nav>

      
      <nav className="tab-nav">
        <a href="/student/dashboard" data-cta-id="tab-overview" className="tab-item active" onClick={() => nav("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>
          </svg>
          Overview
        </a>
        <a href="/student/assignments" data-cta-id="tab-assignments" className="tab-item" onClick={() => nav("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
          Assignments
        </a>
        <a href="/student/timeline" data-cta-id="tab-timeline" className="tab-item" onClick={() => nav("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Timeline
        </a>
        <a href="/student/achievements" data-cta-id="tab-achievements" className="tab-item" onClick={() => nav("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
          </svg>
          Achievements
        </a>
        <a href="/student/goals" data-cta-id="tab-goals" className="tab-item" onClick={() => nav("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>
          </svg>
          Goals
        </a>
      </nav>

      
      <div className="page-header">
        <div>
          <h1 className="page-title">My Learning</h1>
          <p className="page-subtitle">Track your progress and keep learning!</p>
        </div>
        <div className="page-actions flex items-center gap-4">
          <div className="time-toggle">
            <button data-cta-id="time-day" onClick={() => nav("/")} type="button">Day</button>
            <button data-cta-id="time-week" className="active" onClick={() => nav("/")} type="button">Week</button>
            <button data-cta-id="time-month" onClick={() => nav("/")} type="button">Month</button>
          </div>
          <button data-cta-id="keep-going" data-action="navigate" data-target="/play" className="keep-going-btn" onClick={() => nav("/play")} type="button">
            Keep Going
          </button>
        </div>
      </div>

      
      <div data-list="summary" className="summary-grid">
        <div className="summary-card streak-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Current Streak</span>
            <div style={{ "background": "rgba(245,158,11,0.2)", "color": "#f59e0b" }} className="summary-card-icon">
              🔥
            </div>
          </div>
          <p data-field="streak_days" className="summary-card-value">{streak_days}</p>
          <p className="text-xs text-muted">Days in a row</p>
        </div>

        <div className="summary-card xp-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Total XP</span>
            <div style={{ "background": "rgba(124,58,237,0.2)", "color": "#7c3aed" }} className="summary-card-icon">
              ⭐
            </div>
          </div>
          <p data-field="total_xp" className="summary-card-value">{total_xp}</p>
          <p className="text-xs text-muted">Experience points</p>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Items Completed</span>
            <div className="summary-card-icon green">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
          </div>
          <p data-field="items_completed" className="summary-card-value">{items_completed}</p>
          <p className="text-xs text-muted">This week</p>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Time Practiced</span>
            <div className="summary-card-icon purple">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
          </div>
          <p data-field="time_practiced" className="summary-card-value">{time_practiced}</p>
          <p className="text-xs text-muted">This week</p>
        </div>
      </div>

      
      <div className="card mb-6">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="card-title">Active Assignments</h3>
              <p className="card-subtitle">Tasks from your teachers and parents</p>
            </div>
            <a href="/student/assignments" data-cta-id="view-all-assignments" className="btn btn-ghost btn-sm" onClick={() => nav("/")}>
              View all →
            </a>
          </div>
        </div>
        <div className="card-content">
          <div data-list="assignments" className="space-y-4">
            <div style={{ "padding": "1rem", "background": "var(--border-light)", "borderRadius": "var(--radius-md)" }} className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div style={{ "width": "40px", "height": "40px", "borderRadius": "var(--radius-md)", "background": "var(--primary-light)", "display": "flex", "alignItems": "center", "justifyContent": "center" }}>
                  📐
                </div>
                <div>
                  <p data-field="assignment_title" className="font-semibold">{assignment_title}</p>
                  <p className="text-xs text-muted">Due in 3 days • From Teacher</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div style={{ "width": "80px" }}>
                  <div className="progress">
                    <div style={{ "width": "65%" }} className="progress-bar"></div>
                  </div>
                </div>
                <span data-field="assignment_progress" className="badge badge-default">{assignment_progress}</span>
                <button data-cta-id="continue-assignment" data-action="navigate" data-target="/play?assignment=1" className="btn btn-primary btn-sm" onClick={() => nav("/play?assignment=1")} type="button">
                  Continue
                </button>
              </div>
            </div>

            <div style={{ "padding": "1rem", "background": "var(--border-light)", "borderRadius": "var(--radius-md)" }} className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div style={{ "width": "40px", "height": "40px", "borderRadius": "var(--radius-md)", "background": "var(--success-light)", "display": "flex", "alignItems": "center", "justifyContent": "center" }}>
                  📚
                </div>
                <div>
                  <p className="font-semibold">Reading Comprehension</p>
                  <p className="text-xs text-muted">Due tomorrow • From Parent</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div style={{ "width": "80px" }}>
                  <div className="progress">
                    <div style={{ "width": "30%" }} className="progress-bar"></div>
                  </div>
                </div>
                <span className="badge badge-warning">30%</span>
                <button data-cta-id="continue-assignment-2" className="btn btn-primary btn-sm" onClick={() => nav("/")} type="button">
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      
      <div className="grid-2">
        
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="card-title">Recent Activity</h3>
              <a href="/student/timeline" data-cta-id="view-timeline" className="btn btn-ghost btn-sm" onClick={() => nav("/")}>View all →</a>
            </div>
          </div>
          <div className="card-content">
            <div data-list="activities" className="space-y-4">
              <div className="flex items-center gap-4">
                <div style={{ "width": "8px", "height": "8px", "borderRadius": "50%", "background": "var(--success)" }}></div>
                <div className="flex-1">
                  <p className="font-medium">Completed Fractions Quiz</p>
                  <p className="text-xs text-muted">Today at 4:30 PM</p>
                </div>
                <span className="badge badge-success">+50 XP</span>
              </div>
              <div className="flex items-center gap-4">
                <div style={{ "width": "8px", "height": "8px", "borderRadius": "50%", "background": "var(--primary)" }}></div>
                <div className="flex-1">
                  <p className="font-medium">Started Division Practice</p>
                  <p className="text-xs text-muted">Today at 3:15 PM</p>
                </div>
                <span className="badge badge-outline">In Progress</span>
              </div>
              <div className="flex items-center gap-4">
                <div style={{ "width": "8px", "height": "8px", "borderRadius": "50%", "background": "var(--success)" }}></div>
                <div className="flex-1">
                  <p className="font-medium">Earned "Math Whiz" Badge</p>
                  <p className="text-xs text-muted">Yesterday at 5:00 PM</p>
                </div>
                <span className="badge badge-default">🏆 Badge</span>
              </div>
            </div>
          </div>
        </div>

        
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="card-title">Recommended for You</h3>
              <a href="/courses" data-cta-id="browse-courses" className="btn btn-ghost btn-sm" onClick={() => nav("/")}>Browse all →</a>
            </div>
          </div>
          <div className="card-content">
            <div data-list="recommendations" className="space-y-4">
              <div style={{ "padding": "0.75rem", "border": "1px solid var(--border)", "borderRadius": "var(--radius-md)" }} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div style={{ "width": "36px", "height": "36px", "borderRadius": "var(--radius-sm)", "background": "var(--primary-light)", "display": "flex", "alignItems": "center", "justifyContent": "center" }}>
                    🔢
                  </div>
                  <div>
                    <p className="font-medium text-sm">Advanced Multiplication</p>
                    <p className="text-xs text-muted">15 items • Math</p>
                  </div>
                </div>
                <button data-cta-id="start-course-1" data-action="navigate" data-target="/play?course=adv-mult" className="btn btn-outline btn-sm" onClick={() => nav("/play?course=adv-mult")} type="button">
                  Start
                </button>
              </div>
              <div style={{ "padding": "0.75rem", "border": "1px solid var(--border)", "borderRadius": "var(--radius-md)" }} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div style={{ "width": "36px", "height": "36px", "borderRadius": "var(--radius-sm)", "background": "var(--success-light)", "display": "flex", "alignItems": "center", "justifyContent": "center" }}>
                    📖
                  </div>
                  <div>
                    <p className="font-medium text-sm">Story Time: Adventures</p>
                    <p className="text-xs text-muted">10 items • Reading</p>
                  </div>
                </div>
                <button data-cta-id="start-course-2" className="btn btn-outline btn-sm" onClick={() => nav("/")} type="button">
                  Start
                </button>
              </div>
            </div>
          </div>
        </div>
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
