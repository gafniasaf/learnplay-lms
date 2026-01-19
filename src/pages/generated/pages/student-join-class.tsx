
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function StudentJoinClass() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [classCode, setClassCode] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">← Back</button>
    <h1>Join a Class</h1>
    <div></div>
  </header>
  
  <div className="container join-container">
    <div className="join-icon">🎓</div>
    <h2>Enter Class Code</h2>
    <p style={{ "color": "var(--color-text-muted)", "marginTop": "0.5rem" }}>
      Ask your teacher for the class code
    </p>
    
    <form data-form-id="join-class-form">
      <input type="text" data-field="classCode" placeholder="ABC123" required className="code-input" value={classCode} onChange={(e) => setClassCode(e.target.value)} />
      
      <div style={{ "display": "none" }} className="class-preview">
        <h3>🏫 Mrs. Johnson's Math Class</h3>
        <p style={{ "color": "var(--color-text-muted)", "fontSize": "0.875rem" }}>
          5th Grade • 24 students
        </p>
      </div>
      
      <button type="submit" style={{ "width": "100%" }} data-cta-id="join-class" data-action="save" data-entity="class-enrollment" data-form="join-class-form" className="btn-primary btn-large" onClick={async () => {
            try {
              await mcp.saveRecord("class-enrollment", { id });
              toast.success("Saved: join-class");
            } catch (e) {
              toast.error("Save failed: join-class");
            }
          }}>
        Join Class
      </button>
    </form>
    
    <p style={{ "marginTop": "1.5rem", "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>
      Don't have a code? <a href="/courses" style={{ "color": "var(--color-primary)" }}>Browse courses</a> instead.
    </p>
  </div>

    </div>
  );
}
