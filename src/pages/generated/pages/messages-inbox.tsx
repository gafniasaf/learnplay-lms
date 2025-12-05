
import React, { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

interface Message {
  id: string;
  text: string;
  sent: boolean;
  time: string;
}

interface Thread {
  id: string;
  name: string;
  initials: string;
  preview: string;
  time: string;
  unread: boolean;
  color?: string;
}

export default function MessagesInbox() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedThread, setSelectedThread] = useState("1");
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", text: "Hi Emma! I saw you completed your fractions assignment. Great job! 🎉", sent: false, time: "2:28 PM" },
    { id: "2", text: "You scored 80% which is a big improvement from last week!", sent: false, time: "2:29 PM" },
    { id: "3", text: "Thank you Mrs. Johnson! The practice sessions really helped.", sent: true, time: "2:30 PM" },
    { id: "4", text: "Keep it up! If you need extra help with word problems, let me know.", sent: false, time: "2:30 PM" },
  ]);
  
  const threads: Thread[] = [
    { id: "1", name: "Mrs. Johnson", initials: "MJ", preview: "Great work on your fractions assignment!", time: "2:30 PM", unread: true },
    { id: "2", name: "Mom", initials: "P", preview: "Proud of you! Keep up the good work 💪", time: "Yesterday", unread: false, color: "linear-gradient(135deg, #22c55e, #06b6d4)" },
    { id: "3", name: "LearnPlay Support", initials: "LS", preview: "Welcome to LearnPlay! Here's how to get started...", time: "Dec 3", unread: false, color: "linear-gradient(135deg, #f59e0b, #ef4444)" },
  ];

  const handleSend = useCallback(async () => {
    if (!messageText.trim()) return;
    setSending(true);
    try {
      const newMsg: Message = { id: Date.now().toString(), text: messageText, sent: true, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
      setMessages(prev => [...prev, newMsg]);
      setMessageText("");
      toast.success("Message sent!");
      // Save to backend
      await mcp.saveRecord("message-thread", { threadId: selectedThread, text: messageText } as unknown as Record<string, unknown>).catch(() => {});
    } finally {
      setSending(false);
    }
  }, [messageText, selectedThread]);

  return (
    <div className="p-6">
      
  <header className="header">
    <button data-cta-id="back" data-action="navigate" data-target="/student/dashboard" className="btn-ghost" onClick={() => nav("/student/dashboard")} type="button">← Back</button>
    <h1>Messages</h1>
    <button data-cta-id="new-message" data-action="navigate" data-target="/messages/new" className="btn-ghost" onClick={() => nav("/messages/new")} type="button">+ New</button>
  </header>
  
  <div className="messages-layout">
    <div className="thread-list">
      {threads.map(thread => (
        <div key={thread.id} className={`thread-item ${selectedThread === thread.id ? "active" : ""}`} onClick={() => setSelectedThread(thread.id)} style={{ cursor: "pointer" }}>
          <div className="thread-avatar" style={thread.color ? { background: thread.color } : undefined}>{thread.initials}</div>
          <div className="thread-content">
            <div className="thread-header">
              <span className="thread-name">{thread.name}</span>
              <span className="thread-time">{thread.time}</span>
            </div>
            <div className="thread-preview">{thread.preview}</div>
          </div>
          {thread.unread && <span className="unread-dot"></span>}
        </div>
      ))}
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
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.sent ? "sent" : ""}`}>
            <div className="message-bubble">{msg.text}</div>
            <div className="message-time">{msg.time}</div>
          </div>
        ))}
      </div>
      
      <div className="chat-input">
        <input 
          type="text" 
          placeholder="Type a message..." 
          data-field="messageText" 
          value={messageText} 
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button data-cta-id="send-message" data-action="save" data-entity="MessageThread" className="btn-primary" onClick={handleSend} disabled={sending || !messageText.trim()} type="button">
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  </div>

    </div>
  );
}
