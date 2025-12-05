
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function CatalogBuilder() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [title, setTitle] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [difficulty, setDifficulty] = React.useState("");
  const [published, setPublished] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/admin/console" className="btn-ghost" onClick={() => nav("/admin/console")} type="button">← Back</button>
    <h1>Course Builder</h1>
    <div></div>
  </header>
  
  <div className="builder-layout">
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-title">Courses</div>
        <ul className="course-list">
          <li className="course-item active">
            <span>📐</span> 5th Grade Fractions
          </li>
          <li className="course-item">
            <span>🔬</span> Cell Biology
          </li>
          <li className="course-item">
            <span>📖</span> Reading Comprehension
          </li>
          <li className="course-item">
            <span>🧮</span> Multiplication Tables
          </li>
        </ul>
      </div>
      
      <button style={{ "width": "100%" }} data-cta-id="new-course" data-action="save" data-entity="CourseBlueprint" className="btn-primary" onClick={async () => {
            try {
              await mcp.saveRecord("CourseBlueprint", { id });
              toast.success("Saved: new-course");
            } catch (e) {
              toast.error("Save failed: new-course");
            }
          }} type="button">
        + New Course
      </button>
    </div>
    
    <div className="editor-area">
      <div className="editor-header">
        <div data-field="title" className="editor-title">{title}</div>
        <div className="editor-actions">
          <button data-cta-id="ai-generate" data-action="enqueueJob" data-job-type="ai_course_generate" className="btn-ai" onClick={async () => {
            try {
              await mcp.enqueueJob("ai_course_generate", { planBlueprintId: id });
              toast.success("Job enqueued: ai-generate");
            } catch (e) {
              toast.error("Job failed: ai-generate");
            }
          }} type="button">
            ✨ AI Generate
          </button>
          <button data-cta-id="guard-course" data-action="enqueueJob" data-job-type="guard_course" className="btn-secondary" onClick={async () => {
            try {
              await mcp.enqueueJob("guard_course", { planBlueprintId: id });
              toast.success("Job enqueued: guard-course");
            } catch (e) {
              toast.error("Job failed: guard-course");
            }
          }} type="button">
            🛡️ Guard Check
          </button>
          <button data-cta-id="save-course" data-action="save" data-entity="CourseBlueprint" className="btn-primary" onClick={async () => {
            try {
              await mcp.saveRecord("CourseBlueprint", { id });
              toast.success("Saved: save-course");
            } catch (e) {
              toast.error("Save failed: save-course");
            }
          }} type="button">
            Save
          </button>
        </div>
      </div>
      
      <div className="guard-status passed">
        <span>🛡️</span>
        <span style={{ "fontWeight": "500" }}>Guard Status: Passed</span>
        <span style={{ "color": "var(--color-text-muted)" }}>• Last checked 2h ago</span>
      </div>
      
      <div className="metadata-grid">
        <div className="form-group">
          <label>Subject</label>
          <select data-field="subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="math" selected>Mathematics</option>
            <option value="science">Science</option>
            <option value="english">English</option>
          </select>
        </div>
        <div className="form-group">
          <label>Difficulty</label>
          <select data-field="difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="elementary" selected>Elementary</option>
            <option value="middle">Middle School</option>
            <option value="high">High School</option>
          </select>
        </div>
        <div className="form-group">
          <label>Published</label>
          <select data-field="published" value={published} onChange={(e) => setPublished(e.target.value)}>
            <option value="true">Yes - Visible to students</option>
            <option value="false">No - Draft only</option>
          </select>
        </div>
        <div className="form-group">
          <label>Questions</label>
          <input type="text" value="50 items" readOnly style={{ "background": "var(--color-bg)" }} />
        </div>
      </div>
      
      <h3 style={{ "marginBottom": "1rem" }}>Sections</h3>
      <ul className="section-list">
        <li className="section-item">
          <div className="section-header">
            <span className="section-drag">⋮⋮</span>
            <span className="section-title">1. Introduction to Fractions</span>
            <span className="section-meta">10 questions</span>
            <span>▾</span>
          </div>
          <div className="question-preview">
            Q1: What is 1/2 + 1/4? • Q2: Simplify 4/8 • Q3: Which is larger: 2/3 or 3/4? ...
          </div>
        </li>
        <li className="section-item">
          <div className="section-header">
            <span className="section-drag">⋮⋮</span>
            <span className="section-title">2. Adding Fractions</span>
            <span className="section-meta">12 questions</span>
            <span>▸</span>
          </div>
        </li>
        <li className="section-item">
          <div className="section-header">
            <span className="section-drag">⋮⋮</span>
            <span className="section-title">3. Subtracting Fractions</span>
            <span className="section-meta">10 questions</span>
            <span>▸</span>
          </div>
        </li>
        <li className="section-item">
          <div className="section-header">
            <span className="section-drag">⋮⋮</span>
            <span className="section-title">4. Multiplying Fractions</span>
            <span className="section-meta">10 questions</span>
            <span>▸</span>
          </div>
        </li>
        <li className="section-item">
          <div className="section-header">
            <span className="section-drag">⋮⋮</span>
            <span className="section-title">5. Word Problems</span>
            <span className="section-meta">8 questions</span>
            <span>▸</span>
          </div>
        </li>
      </ul>
      
      <button style={{ "marginTop": "1rem" }} className="btn-secondary">
        + Add Section
      </button>
    </div>
  </div>

    </div>
  );
}
