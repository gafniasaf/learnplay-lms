
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function ParentDashboard() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [parent_name, setParent_name] = React.useState("");
  const [total_children, setTotal_children] = React.useState("");
  const [total_alerts, setTotal_alerts] = React.useState("");
  const [average_streak, setAverage_streak] = React.useState("");
  const [total_xp, setTotal_xp] = React.useState("");
  const [math_mastery, setMath_mastery] = React.useState("");
  const [reading_mastery, setReading_mastery] = React.useState("");
  const [math_minutes, setMath_minutes] = React.useState("");
  const [reading_minutes, setReading_minutes] = React.useState("");
  const [science_minutes, setScience_minutes] = React.useState("");
  const [time_goal_progress, setTime_goal_progress] = React.useState("");
  const [items_goal_progress, setItems_goal_progress] = React.useState("");

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
        <a href="/parent">Parent</a>
        <span className="breadcrumb-separator">›</span>
        <span>Overview</span>
      </nav>

      
      <nav className="tab-nav">
        <a href="/parent/dashboard" data-cta-id="tab-overview" className="tab-item active" onClick={() => nav("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>
          </svg>
          Overview
        </a>
        <a href="/parent/subjects" data-cta-id="tab-subjects" className="tab-item" onClick={() => nav("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
          Subjects
        </a>
        <a href="/parent/topics" data-cta-id="tab-topics" className="tab-item" onClick={() => nav("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          Topics
        </a>
        <a href="/parent/timeline" data-cta-id="tab-timeline" className="tab-item" onClick={() => nav("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Timeline
        </a>
        <a href="/parent/goals" data-cta-id="tab-goals" className="tab-item" onClick={() => nav("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>
          </svg>
          Goals
        </a>
      </nav>

      
      <div className="page-header">
        <div>
          <h1 data-field="parent_name" className="page-title">{parent_name}</h1>
          <p className="page-subtitle">Monitor progress across your children and stay ahead of upcoming work.</p>
        </div>
        <div className="page-actions">
          <button data-cta-id="link-child" data-action="navigate" data-target="/parent/children" className="btn btn-outline btn-sm" onClick={() => nav("/parent/children")} type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            Link Child
          </button>
          <button data-cta-id="messages" data-action="navigate" data-target="/parent/messages" className="btn btn-primary btn-sm" onClick={() => nav("/parent/messages")} type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
            Messages
          </button>
        </div>
      </div>

      
      <div data-list="summary" className="summary-grid">
        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Children Linked</span>
            <div className="summary-card-icon purple">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
          </div>
          <p data-field="total_children" className="summary-card-value">{total_children}</p>
          <p className="text-xs text-muted">Active connections</p>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Total Alerts</span>
            <div className="summary-card-icon red">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </div>
          </div>
          <p data-field="total_alerts" className="summary-card-value">{total_alerts}</p>
          <p className="text-xs text-muted">Overdue items & goals</p>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Average Streak</span>
            <div className="summary-card-icon green">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>
              </svg>
            </div>
          </div>
          <p data-field="average_streak" className="summary-card-value">{average_streak}</p>
          <p className="text-xs text-muted">Days consistent</p>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Total XP</span>
            <div className="summary-card-icon amber">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </div>
          </div>
          <p data-field="total_xp" className="summary-card-value">{total_xp}</p>
          <p className="text-xs text-muted">Experience points</p>
        </div>
      </div>

      
      <div className="card mb-6">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="card-title">Growth Tracker</h3>
              <p className="card-subtitle">Track skill development across domains</p>
            </div>
            <a href="/parent/skills" data-cta-id="view-skills" className="btn btn-ghost btn-sm" onClick={() => nav("/")}>
              View details →
            </a>
          </div>
        </div>
        <div className="card-content">
          <div data-list="domains" className="grid-2">
            
            <div style={{ "padding": "1rem", "background": "var(--border-light)", "borderRadius": "var(--radius-md)" }} className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Mathematics</p>
                <p className="text-sm text-muted">12 skills tracked</p>
              </div>
              <div className="flex items-center gap-4">
                <div style={{ "width": "100px" }}>
                  <div className="progress">
                    <div style={{ "width": "78%" }} className="progress-bar"></div>
                  </div>
                </div>
                <span data-field="math_mastery" className="font-semibold">{math_mastery}</span>
              </div>
            </div>
            
            <div style={{ "padding": "1rem", "background": "var(--border-light)", "borderRadius": "var(--radius-md)" }} className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Reading</p>
                <p className="text-sm text-muted">8 skills tracked</p>
              </div>
              <div className="flex items-center gap-4">
                <div style={{ "width": "100px" }}>
                  <div className="progress">
                    <div style={{ "width": "65%" }} className="progress-bar"></div>
                  </div>
                </div>
                <span data-field="reading_mastery" className="font-semibold">{reading_mastery}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      
      <div className="grid-2">
        
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="card-title">Time by Subject</h3>
              <a href="/parent/subjects" data-cta-id="view-all-subjects" className="btn btn-ghost btn-sm" onClick={() => nav("/")}>View all →</a>
            </div>
          </div>
          <div className="card-content">
            <div data-list="subjects" className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Math</span>
                <div className="flex items-center gap-2">
                  <div style={{ "width": "80px" }}>
                    <div className="progress">
                      <div style={{ "width": "60%" }} className="progress-bar"></div>
                    </div>
                  </div>
                  <span data-field="math_minutes" className="text-sm text-muted">{math_minutes}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Reading</span>
                <div className="flex items-center gap-2">
                  <div style={{ "width": "80px" }}>
                    <div className="progress">
                      <div style={{ "width": "40%" }} className="progress-bar"></div>
                    </div>
                  </div>
                  <span data-field="reading_minutes" className="text-sm text-muted">{reading_minutes}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Science</span>
                <div className="flex items-center gap-2">
                  <div style={{ "width": "80px" }}>
                    <div className="progress">
                      <div style={{ "width": "20%" }} className="progress-bar"></div>
                    </div>
                  </div>
                  <span data-field="science_minutes" className="text-sm text-muted">{science_minutes}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="card-title">Weekly Goals</h3>
              <a href="/parent/goals" data-cta-id="view-goals-alerts" className="btn btn-ghost btn-sm" onClick={() => nav("/")}>View goals & alerts →</a>
            </div>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">Time Goal</span>
                  <span data-field="time_goal_progress" className="text-sm font-medium">{time_goal_progress}</span>
                </div>
                <div className="progress">
                  <div style={{ "width": "75%" }} className="progress-bar success"></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">Items Goal</span>
                  <span data-field="items_goal_progress" className="text-sm font-medium">{items_goal_progress}</span>
                </div>
                <div className="progress">
                  <div style={{ "width": "60%" }} className="progress-bar"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2 mt-6">
        
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="card-title">Recent Topics</h3>
              <a href="/parent/topics" data-cta-id="view-all-topics" className="btn btn-ghost btn-sm" onClick={() => nav("/")}>View all topics →</a>
            </div>
          </div>
          <div className="card-content">
            <div data-list="topics" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Multiplication</p>
                  <p className="text-xs text-muted">Math • 3 items</p>
                </div>
                <span className="badge badge-success">92%</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Fractions</p>
                  <p className="text-xs text-muted">Math • 5 items</p>
                </div>
                <span className="badge badge-warning">68%</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Reading Comprehension</p>
                  <p className="text-xs text-muted">Reading • 2 items</p>
                </div>
                <span className="badge badge-success">85%</span>
              </div>
            </div>
          </div>
        </div>

        
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <h3 className="card-title">Recent Activity</h3>
              <a href="/parent/timeline" data-cta-id="view-timeline" className="btn btn-ghost btn-sm" onClick={() => nav("/")}>View timeline →</a>
            </div>
          </div>
          <div className="card-content">
            <div data-list="activities" className="space-y-4">
              <div className="flex items-center gap-4">
                <div style={{ "width": "8px", "height": "8px", "borderRadius": "50%", "background": "var(--success)" }}></div>
                <div className="flex-1">
                  <p className="font-medium">Completed Multiplication Quiz</p>
                  <p className="text-xs text-muted">Today at 3:30 PM • 15 min</p>
                </div>
                <span className="badge badge-success">92%</span>
              </div>
              <div className="flex items-center gap-4">
                <div style={{ "width": "8px", "height": "8px", "borderRadius": "50%", "background": "var(--primary)" }}></div>
                <div className="flex-1">
                  <p className="font-medium">Started Reading Practice</p>
                  <p className="text-xs text-muted">Yesterday at 4:15 PM • 10 min</p>
                </div>
                <span className="badge badge-outline">In Progress</span>
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
