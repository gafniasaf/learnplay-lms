
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function MessagesInbox() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const [messageText, setMessageText] = React.useState("");

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">← Back</button>
    <h1>Messages</h1>
    <button data-cta-id="new-message" data-action="navigate" data-target="/messages/new" className="btn-ghost" onClick={() => nav("/messages/new")} type="button">+ New</button>
  </header>
  
  <div className="messages-layout">
    <div className="thread-list">
      <div className="thread-item active">
        <div className="thread-avatar">MJ</div>
        <div className="thread-content">
          <div className="thread-header">
            <span className="thread-name">Mrs. Johnson</span>
            <span className="thread-time">2:30 PM</span>
          </div>
          <div className="thread-preview">Great work on your fractions assignment!</div>
        </div>
        <span className="unread-dot"></span>
      </div>
      
      <div className="thread-item">
        <div style={{ "background": "linear-gradient(135deg, #22c55e, #06b6d4)" }} className="thread-avatar">P</div>
        <div className="thread-content">
          <div className="thread-header">
            <span className="thread-name">Mom</span>
            <span className="thread-time">Yesterday</span>
          </div>
          <div className="thread-preview">Proud of you! Keep up the good work 💪</div>
        </div>
      </div>
      
      <div className="thread-item">
        <div style={{ "background": "linear-gradient(135deg, #f59e0b, #ef4444)" }} className="thread-avatar">LS</div>
        <div className="thread-content">
          <div className="thread-header">
            <span className="thread-name">LearnPlay Support</span>
            <span className="thread-time">Dec 3</span>
          </div>
          <div className="thread-preview">Welcome to LearnPlay! Here's how to get started...</div>
        </div>
      </div>
    </div>
    
    <div className="chat-area">
      <div className="chat-header">
        <div style={{ "display": "flex", "alignItems": "center", "gap": "0.75rem" }}>
          <div className="thread-avatar">MJ</div>
          <div>
            <div style={{ "fontWeight": "600" }}>Mrs. Johnson</div>
            <div style={{ "fontSize": "0.875rem", "color": "var(--color-text-muted)" }}>5th Grade Math Teacher</div>
          </div>
        </div>
      </div>
      
      <div className="chat-messages">
        <div className="message">
          <div className="message-bubble">
            Hi Emma! I saw you completed your fractions assignment. Great job! 🎉
          </div>
          <div className="message-time">2:28 PM</div>
        </div>
        
        <div className="message">
          <div className="message-bubble">
            You scored 80% which is a big improvement from last week!
          </div>
          <div className="message-time">2:29 PM</div>
        </div>
        
        <div className="message sent">
          <div className="message-bubble">
            Thank you Mrs. Johnson! The practice sessions really helped.
          </div>
          <div className="message-time">2:30 PM</div>
        </div>
        
        <div className="message">
          <div className="message-bubble">
            Keep it up! If you need extra help with word problems, let me know. I can assign some extra practice.
          </div>
          <div className="message-time">2:30 PM</div>
        </div>
      </div>
      
      <div className="chat-input">
        <input type="text" placeholder="Type a message..." data-field="messageText" value={messageText} onChange={(e) => setMessageText(e.target.value)} />
        <button data-cta-id="send-message" data-action="save" data-entity="MessageThread" className="btn-primary" onClick={async () => {
            try {
              await mcp.saveRecord("MessageThread", { id });
              toast.success("Saved: send-message");
            } catch (e) {
              toast.error("Save failed: send-message");
            }
          }} type="button">
          Send
        </button>
      </div>
    </div>
  </div>

    </div>
  );
}
