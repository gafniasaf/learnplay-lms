
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function TeacherAssignments() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/teacher/dashboard" className="btn-ghost" onClick={() => nav("/teacher/dashboard")} type="button">← Back</button>
    <h1>Assignments</h1>
    <button data-cta-id="create" data-action="navigate" data-target="/teacher/control" className="btn-ghost" onClick={() => nav("/teacher/control")} type="button">+ New</button>
  </header>
  
  <div className="container">
    <div className="filter-row">
      <button style={{ "padding": "0.5rem 1rem" }} className="btn-secondary">All (12)</button>
      <button style={{ "padding": "0.5rem 1rem" }} className="btn-secondary">Active (5)</button>
      <button style={{ "padding": "0.5rem 1rem" }} className="btn-secondary">Scheduled (3)</button>
      <button style={{ "padding": "0.5rem 1rem" }} className="btn-secondary">Completed (4)</button>
    </div>
    
    <div className="assignment-list">
      <div className="assignment-item">
        <div className="assignment-icon">📐</div>
        <div className="assignment-details">
          <div className="assignment-title">Fractions Practice</div>
          <div className="assignment-meta">Math • 5th Grade Math P1 • Due Dec 5</div>
        </div>
        <div className="assignment-stats">
          <div>
            <div className="stat-num">18</div>
            <div className="stat-label">Completed</div>
          </div>
          <div>
            <div className="stat-num">6</div>
            <div className="stat-label">In Progress</div>
          </div>
          <div>
            <div className="stat-num">82%</div>
            <div className="stat-label">Avg Score</div>
          </div>
        </div>
        <button data-cta-id="view-assignment" data-action="navigate" data-target="/teacher/assignment-progress" className="btn-secondary" onClick={() => nav("/teacher/assignment-progress")} type="button">View</button>
      </div>
      
      <div className="assignment-item">
        <div className="assignment-icon">🔬</div>
        <div className="assignment-details">
          <div className="assignment-title">Cell Biology Quiz</div>
          <div className="assignment-meta">Science • 5th Grade Math P1 • Due Dec 8</div>
        </div>
        <div className="assignment-stats">
          <div>
            <div className="stat-num">5</div>
            <div className="stat-label">Completed</div>
          </div>
          <div>
            <div className="stat-num">12</div>
            <div className="stat-label">In Progress</div>
          </div>
          <div>
            <div className="stat-num">75%</div>
            <div className="stat-label">Avg Score</div>
          </div>
        </div>
        <button className="btn-secondary">View</button>
      </div>
      
      <div style={{ "opacity": "0.7" }} className="assignment-item">
        <div className="assignment-icon">📚</div>
        <div className="assignment-details">
          <div className="assignment-title">Reading Comprehension</div>
          <div className="assignment-meta">English • 5th Grade Math P3 • Scheduled Dec 10</div>
        </div>
        <div className="assignment-stats">
          <div>
            <div className="stat-num">—</div>
            <div className="stat-label">Not Started</div>
          </div>
        </div>
        <button className="btn-secondary">Edit</button>
      </div>
      
      <div style={{ "opacity": "0.6" }} className="assignment-item">
        <div className="assignment-icon">✅</div>
        <div className="assignment-details">
          <div className="assignment-title">Multiplication Tables</div>
          <div className="assignment-meta">Math • Completed Dec 1</div>
        </div>
        <div className="assignment-stats">
          <div>
            <div className="stat-num">24</div>
            <div className="stat-label">Completed</div>
          </div>
          <div>
            <div className="stat-num">89%</div>
            <div className="stat-label">Avg Score</div>
          </div>
        </div>
        <button className="btn-ghost">Archive</button>
      </div>
    </div>
  </div>

    </div>
  );
}
