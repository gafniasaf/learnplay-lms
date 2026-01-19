
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function Settings() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("");
  const [darkMode, setDarkMode] = React.useState("");
  const [soundEffects, setSoundEffects] = React.useState("");
  const [animations, setAnimations] = React.useState("");
  const [emailNotifications, setEmailNotifications] = React.useState("");
  const [pushNotifications, setPushNotifications] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">← Back</button>
    <h1>Settings</h1>
    <div></div>
  </header>
  
  <div className="container">
    <div className="settings-nav">
      <button className="settings-tab active">Account</button>
      <button className="settings-tab">Notifications</button>
      <button className="settings-tab">Privacy</button>
      <button className="settings-tab">API Keys</button>
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
            <option value="student" selected>Student</option>
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
          <div data-field="darkMode" className="toggle-switch">{darkMode}</div>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Sound Effects</h4>
            <p>Play sounds for correct/incorrect answers</p>
          </div>
          <div data-field="soundEffects" className="toggle-switch active">{soundEffects}</div>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Celebration Animations</h4>
            <p>Show confetti on achievements</p>
          </div>
          <div data-field="animations" className="toggle-switch active">{animations}</div>
        </div>
      </div>
      
      <div className="settings-section">
        <h3>Notifications</h3>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Email Notifications</h4>
            <p>Receive weekly progress summaries</p>
          </div>
          <div data-field="emailNotifications" className="toggle-switch active">{emailNotifications}</div>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <h4>Push Notifications</h4>
            <p>Get reminders for assignments</p>
          </div>
          <div data-field="pushNotifications" className="toggle-switch">{pushNotifications}</div>
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
        <button type="submit" data-cta-id="save-settings" data-action="save" data-entity="Settings" data-form="settings-form" className="btn-primary" onClick={async () => {
            try {
              await mcp.saveRecord("Settings", { id });
              toast.success("Saved: save-settings");
            } catch (e) {
              toast.error("Save failed: save-settings");
            }
          }}>Save Changes</button>
      </div>
    </form>
  </div>

    </div>
  );
}
