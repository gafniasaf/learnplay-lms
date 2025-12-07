
import React, { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

interface Student {
  id: string;
  name: string;
}

export default function TeacherControl() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [due_date, setDue_date] = useState("");
  const [learner_id, setLearner_id] = useState("");
  const [ai_suggestions, setAi_suggestions] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Load students for dropdown
  useEffect(() => {
    async function loadStudents() {
      try {
        const result = await mcp.listRecords("learner-profile", 100);
        const profiles = (result as { records?: { id: string; fullName?: string }[] })?.records || [];
        setStudents(profiles.map(p => ({ id: p.id, name: p.fullName || "Student" })));
      } catch {
        // Demo students on error
        setStudents([{ id: "demo-1", name: "Demo Student 1" }, { id: "demo-2", name: "Demo Student 2" }]);
      }
    }
    loadStudents();
  }, [mcp]);

  const handleAIDraft = useCallback(async () => {
    if (!subject) {
      toast.error("Please select a subject first");
      return;
    }
    setAiLoading(true);
    try {
      await mcp.enqueueJob("draft_assignment_plan", { subject, title, learnerId: learner_id });
      toast.success("AI draft job started!");
      setAi_suggestions("AI is generating suggestions based on student performance...");
      // Poll or wait for result - simplified demo
      setTimeout(() => {
        setAi_suggestions("Suggested: Focus on fractions with visual aids. Recommended: 15 questions, difficulty level 2.");
        setAiLoading(false);
      }, 2000);
    } catch {
      toast.error("AI draft failed - check API keys");
      setAiLoading(false);
    }
  }, [mcp, subject, title, learner_id]);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !subject) {
      toast.error("Title and subject are required");
      return;
    }
    setLoading(true);
    try {
      await mcp.saveRecord("assignment", {
        id: id || undefined,
        title,
        subject,
        dueDate: due_date,
        learnerId: learner_id === "all" ? null : learner_id,
        status: "active",
      } as unknown as Record<string, unknown>);
      toast.success("Assignment saved!");
      nav("/teacher/assignments");
    } catch {
      toast.error("Failed to save assignment");
    } finally {
      setLoading(false);
    }
  }, [mcp, id, title, subject, due_date, learner_id, nav]);

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
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </section>

      
      <section className="card ai-card">
        <h2>✨ AI Assistant</h2>
        <p>Let AI help you create the perfect assignment based on student performance.</p>
        
        <button type="button" data-cta-id="draft-plan" data-action="enqueueJob" data-job-type="draft_assignment_plan" className="btn-ai" onClick={handleAIDraft} disabled={aiLoading}>
          {aiLoading ? "Generating..." : "✨ Generate with AI"}
        </button>
        
        {ai_suggestions && (
          <div data-field="ai_suggestions" className="ai-suggestions" style={{ marginTop: "1rem", padding: "1rem", background: "var(--color-primary-light)", borderRadius: "0.5rem" }}>
            {ai_suggestions}
          </div>
        )}
      </section>

      
      <section className="form-actions">
        <button type="button" data-cta-id="cancel" data-action="navigate" data-target="/teacher/dashboard" className="btn-secondary" onClick={() => nav("/teacher/dashboard")}>
          Cancel
        </button>
        <button type="submit" data-cta-id="save-assignment" data-action="save" data-entity="Assignment" data-form="assignment-form" className="btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "Save Assignment"}
        </button>
      </section>
    </form>
  </main>

    </div>
  );
}
