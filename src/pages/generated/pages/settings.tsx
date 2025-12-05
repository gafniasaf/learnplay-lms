
import React, { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function Settings() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  
  const [displayName, setDisplayName] = useState("Demo User");
  const [email, setEmail] = useState("demo@example.com");
  const [role, setRole] = useState("student");
  const [darkMode, setDarkMode] = useState(false);
  const [soundEffects, setSoundEffects] = useState(true);
  const [animations, setAnimations] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("Account");

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await mcp.saveRecord("settings", {
        displayName,
        email,
        darkMode,
        soundEffects,
        animations,
        emailNotifications,
        pushNotifications,
      } as unknown as Record<string, unknown>);
      toast.success("Settings saved!");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setLoading(false);
    }
  }, [displayName, email, darkMode, soundEffects, animations, emailNotifications, pushNotifications]);

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <div 
      className={`toggle-switch ${value ? "active" : ""}`} 
      onClick={() => onChange(!value)}
      style={{ 
        width: "50px", height: "28px", borderRadius: "14px", 
        background: value ? "var(--color-primary)" : "var(--color-border)",
        position: "relative", cursor: "pointer", transition: "background 0.2s"
      }}
    >
      <div style={{
        width: "24px", height: "24px", borderRadius: "50%", background: "white",
        position: "absolute", top: "2px", left: value ? "24px" : "2px",
        transition: "left 0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
      }} />
    </div>
  );

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">← Back</button>
    <h1>Settings</h1>
    <div></div>
  </header>
  
  <div className="container">
    <div className="settings-nav">
      {["Account", "Notifications", "Privacy", "API Keys"].map(tab => (
        <button key={tab} className={`settings-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>{tab}</button>
      ))}
    </div>
    
    <form data-form-id="settings-form">
      <div className="settings-section">
        <h3>Profile</h3>
        <div className="form-group">
          <label>Display Name</label>
          <input type="text" data-field="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" data-field="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Role</label>
          <select data-field="role" disabled value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="parent">Parent</option>
          </select>
        </div>
      </div>
      
      <div className="settings-section">
        <h3>Preferences</h3>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Dark Mode</h4>
            <p>Switch between light and dark themes</p>
          </div>
          <Toggle value={darkMode} onChange={setDarkMode} />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Sound Effects</h4>
            <p>Play sounds for correct/incorrect answers</p>
          </div>
          <Toggle value={soundEffects} onChange={setSoundEffects} />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Celebration Animations</h4>
            <p>Show confetti on achievements</p>
          </div>
          <Toggle value={animations} onChange={setAnimations} />
        </div>
      </div>
      
      <div className="settings-section">
        <h3>Notifications</h3>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Email Notifications</h4>
            <p>Receive weekly progress summaries</p>
          </div>
          <Toggle value={emailNotifications} onChange={setEmailNotifications} />
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Push Notifications</h4>
            <p>Get reminders for assignments</p>
          </div>
          <Toggle value={pushNotifications} onChange={setPushNotifications} />
        </div>
      </div>
      
      <div className="settings-section danger-zone">
        <h3>Danger Zone</h3>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Export Data</h4>
            <p>Download all your data</p>
          </div>
          <button type="button" className="btn-secondary">Export</button>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Delete Account</h4>
            <p>Permanently delete your account and all data</p>
          </div>
          <button type="button" style={{ "borderColor": "var(--color-error)", "color": "var(--color-error)" }} className="btn-secondary">Delete</button>
        </div>
      </div>
      
      <div className="form-actions">
        <button type="button" data-cta-id="cancel" data-action="navigate" data-target="/student/dashboard" className="btn-secondary" onClick={() => nav("/student/dashboard")}>Cancel</button>
        <button type="submit" data-cta-id="save-settings" data-action="save" data-entity="Settings" data-form="settings-form" className="btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  </div>

    </div>
  );
}
