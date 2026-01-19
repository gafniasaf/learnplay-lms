
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function Auth() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState("");

  return (
    <div className="p-6">
      
  <div className="auth-container">
    <div className="auth-card">
      <div className="auth-logo">
        <span>🎓</span>
        <h1>LearnPlay</h1>
      </div>
      
      <div className="auth-tabs">
        <button className="auth-tab active">Sign In</button>
        <button className="auth-tab">Sign Up</button>
      </div>
      
      <div className="social-login">
        <button data-cta-id="google-login" data-action="navigate" data-target="/oauth/google" className="social-btn" onClick={() => nav("/oauth/google")} type="button">
          <span>🔵</span> Continue with Google
        </button>
      </div>
      
      <div className="divider"><span>or</span></div>
      
      <form data-form-id="login-form">
        <div className="form-group">
          <label>Email</label>
          <input type="email" data-field="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        
        <div className="form-group">
          <label>Password</label>
          <input type="password" data-field="password" placeholder="••••••••" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        
        <div className="forgot-link">
          <a href="/auth/reset">Forgot password?</a>
        </div>
        
        <div className="form-group role-select">
          <label>I am a...</label>
          <select data-field="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="parent">Parent</option>
          </select>
        </div>
        
        <button type="submit" style={{ "width": "100%" }} data-cta-id="login" data-action="navigate" data-target="/student/dashboard" data-form="login-form" className="btn-primary" onClick={() => nav("/student/dashboard")}>
          Sign In
        </button>
      </form>
    </div>
  </div>

    </div>
  );
}
