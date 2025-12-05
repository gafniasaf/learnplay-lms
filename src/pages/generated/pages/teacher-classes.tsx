
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function TeacherClasses() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="menu" data-action="navigate" data-target="/teacher/dashboard" className="btn-ghost" onClick={() => nav("/teacher/dashboard")} type="button">← Back</button>
    <h1>My Classes</h1>
    <button data-cta-id="create-class" data-action="navigate" data-target="/teacher/classes/new" className="btn-ghost" onClick={() => nav("/teacher/classes/new")} type="button">+ New</button>
  </header>
  
  <div className="container">
    <div className="class-grid">
      <div className="class-card">
        <div className="class-header">
          <div className="class-name">5th Grade Math - Period 1</div>
          <div className="class-grade">Grade 5 • Room 204</div>
        </div>
        <div className="class-body">
          <div className="class-stat">
            <span>Students</span>
            <span style={{ "fontWeight": "600" }}>24</span>
          </div>
          <div className="class-stat">
            <span>Avg. Progress</span>
            <span style={{ "fontWeight": "600" }}>78%</span>
          </div>
          <div className="class-stat">
            <span>Active Assignments</span>
            <span style={{ "fontWeight": "600" }}>3</span>
          </div>
          <div className="class-stat">
            <span>Class Code</span>
            <span className="class-code">MTH501</span>
          </div>
        </div>
        <div className="class-actions">
          <button style={{ "flex": "1" }} data-cta-id="view-students" data-action="navigate" data-target="/teacher/students" className="btn-secondary" onClick={() => nav("/teacher/students")} type="button">Students</button>
          <button style={{ "flex": "1" }} data-cta-id="view-progress" data-action="navigate" data-target="/teacher/class-progress" className="btn-primary" onClick={() => nav("/teacher/class-progress")} type="button">Progress</button>
        </div>
      </div>
      
      <div className="class-card">
        <div style={{ "background": "linear-gradient(135deg, #22c55e, #06b6d4)" }} className="class-header">
          <div className="class-name">5th Grade Math - Period 3</div>
          <div className="class-grade">Grade 5 • Room 204</div>
        </div>
        <div className="class-body">
          <div className="class-stat">
            <span>Students</span>
            <span style={{ "fontWeight": "600" }}>22</span>
          </div>
          <div className="class-stat">
            <span>Avg. Progress</span>
            <span style={{ "fontWeight": "600" }}>82%</span>
          </div>
          <div className="class-stat">
            <span>Active Assignments</span>
            <span style={{ "fontWeight": "600" }}>2</span>
          </div>
          <div className="class-stat">
            <span>Class Code</span>
            <span className="class-code">MTH503</span>
          </div>
        </div>
        <div className="class-actions">
          <button style={{ "flex": "1" }} className="btn-secondary">Students</button>
          <button style={{ "flex": "1" }} className="btn-primary">Progress</button>
        </div>
      </div>
      
      <div className="class-card">
        <div style={{ "background": "linear-gradient(135deg, #f59e0b, #ef4444)" }} className="class-header">
          <div className="class-name">Remedial Math</div>
          <div className="class-grade">Mixed Grades • Room 208</div>
        </div>
        <div className="class-body">
          <div className="class-stat">
            <span>Students</span>
            <span style={{ "fontWeight": "600" }}>12</span>
          </div>
          <div className="class-stat">
            <span>Avg. Progress</span>
            <span style={{ "fontWeight": "600" }}>65%</span>
          </div>
          <div className="class-stat">
            <span>Active Assignments</span>
            <span style={{ "fontWeight": "600" }}>4</span>
          </div>
          <div className="class-stat">
            <span>Class Code</span>
            <span className="class-code">RMD100</span>
          </div>
        </div>
        <div className="class-actions">
          <button style={{ "flex": "1" }} className="btn-secondary">Students</button>
          <button style={{ "flex": "1" }} className="btn-primary">Progress</button>
        </div>
      </div>
    </div>
  </div>

    </div>
  );
}
