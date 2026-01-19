
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function TeacherControl() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [title, setTitle] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [due_date, setDue_date] = React.useState("");
  const [learner_id, setLearner_id] = React.useState("");
  const [ai_suggestions, setAi_suggestions] = React.useState("");
  const [suggestion, setSuggestion] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/teacher/dashboard" onClick={() => nav("/teacher/dashboard")} type="button">← Back</button>
    <h1>📝 Create Assignment</h1>
  </header>

  <main className="container">
    <form data-form-id="assignment-form">
      
      <section className="card">
        <h2>Assignment Details</h2>
        
        <div className="form-group">
          <label htmlFor="title">Title *</label>
          <input type="text" id="title" data-field="title" placeholder="Enter assignment title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="form-group">
          <label htmlFor="subject">Subject *</label>
          <select id="subject" data-field="subject" required value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Select subject</option>
            <option value="math">Mathematics</option>
            <option value="reading">Reading</option>
            <option value="science">Science</option>
            <option value="history">History</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="due_date">Due Date</label>
          <input type="date" id="due_date" data-field="due_date" value={due_date} onChange={(e) => setDue_date(e.target.value)} />
        </div>

        <div className="form-group">
          <label htmlFor="learner_id">Assign To *</label>
          <select id="learner_id" data-field="learner_id" required value={learner_id} onChange={(e) => setLearner_id(e.target.value)}>
            <option value="">Select student</option>
            <option value="all">All Students</option>
          </select>
        </div>
      </section>

      
      <section className="card ai-card">
        <h2>✨ AI Assistant</h2>
        <p>Let AI help you create the perfect assignment based on student performance.</p>
        
        <button type="button" data-cta-id="draft-plan" data-action="enqueueJob" data-job-type="draft_assignment_plan" className="btn-ai" onClick={async () => {
            try {
              await mcp.enqueueJob("draft_assignment_plan", { planBlueprintId: id });
              toast.success("Job enqueued: draft-plan");
            } catch (e) {
              toast.error("Job failed: draft-plan");
            }
          }}>
          ✨ Generate with AI
        </button>
        
        <div data-field="ai_suggestions" data-state="hidden" className="ai-suggestions">{ai_suggestions}</div>
      </section>

      
      <section className="form-actions">
        <button type="button" data-cta-id="cancel" data-action="navigate" data-target="/teacher/dashboard" className="btn-secondary" onClick={() => nav("/teacher/dashboard")}>
          Cancel
        </button>
        <button type="submit" data-cta-id="save-assignment" data-action="save" data-entity="Assignment" data-form="assignment-form" className="btn-primary" onClick={async () => {
            try {
              await mcp.saveRecord("Assignment", { id });
              toast.success("Saved: save-assignment");
            } catch (e) {
              toast.error("Save failed: save-assignment");
            }
          }}>
          Save Assignment
        </button>
      </section>
    </form>
  </main>

    </div>
  );
}
