import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { sendMessage, listMessages, listConversations, listOrgStudents } from "@/lib/api";
import { Send, Mail, User, Plus, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  sender: {
    id: string;
    full_name: string;
    role: string;
  };
  recipient: {
    id: string;
    full_name: string;
    role: string;
  };
}

interface Conversation {
  id: string;
  full_name: string;
  role: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export default function Inbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageContent, setMessageContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewMessageDialog, setShowNewMessageDialog] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<Array<{id: string; name: string; role: string}>>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [messageOffset, setMessageOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    
    loadConversations();
    loadUserRole();

    // Setup realtime subscription for new messages
    const channel = supabase
      .channel('messages-inbox')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('New message received:', payload);
          loadConversations();
          if (selectedConversation) {
            loadConversationMessages(selectedConversation);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (selectedConversation) {
      setMessageOffset(0);
      loadConversationMessages(selectedConversation, 0);
    }
  }, [selectedConversation]);

  const loadUserRole = async () => {
    if (!user?.id) return;
    
    try {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setUserRole(data?.role || null);
    } catch (error) {
      console.error("Error loading user role:", error);
    }
  };

  const loadAvailableUsers = async () => {
    try {
      if (userRole === "teacher" || userRole === "school_admin") {
        const data = await listOrgStudents();
        setAvailableUsers(data.students.map(s => ({ id: s.id, name: s.name, role: "student" })));
      } else if (userRole === "student") {
        const { data } = await supabase
          .from("organization_users")
          .select("user_id, profiles(id, full_name, role)")
          .in("org_role", ["teacher", "school_admin"]);
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested query types are complex
        const teachers = data?.map((ou: any) => ({
          id: ou.profiles.id,
          name: ou.profiles.full_name || "Teacher",
          role: ou.profiles.role,
        })) || [];
        setAvailableUsers(teachers);
      }
    } catch (error) {
      console.error("Error loading available users:", error);
    }
  };

  const handleOpenNewMessage = () => {
    setShowNewMessageDialog(true);
    loadAvailableUsers();
  };

  const handleSelectUser = (userId: string) => {
    setSelectedConversation(userId);
    setShowNewMessageDialog(false);
    setSearchTerm("");
  };

  const loadConversations = async () => {
    try {
      setLoading(true);
      const data = await listConversations();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadConversationMessages = async (partnerId: string, offset = 0) => {
    try {
      const data = await listMessages(partnerId, { limit: 50, offset });
      
      if (offset === 0) {
        setMessages(data.messages || []);
      } else {
        setMessages(prev => [...prev, ...(data.messages || [])]);
      }
      
      setMessageOffset(offset);
      setHasMoreMessages(data.hasMore || false);
    } catch (error) {
      console.error('Error loading conversation:', error);
      toast({
        title: "Error",
        description: "Failed to load conversation",
        variant: "destructive",
      });
    }
  };

  const loadMoreMessages = () => {
    if (selectedConversation && hasMoreMessages) {
      loadConversationMessages(selectedConversation, messageOffset + 50);
    }
  };

  const handleSendMessage = async () => {
    if (!messageContent.trim() || !selectedConversation) return;

    try {
      setSending(true);
      await sendMessage(selectedConversation, messageContent);
      setMessageContent("");
      await loadConversationMessages(selectedConversation, 0);
      await loadConversations();
      toast({
        title: "Success",
        description: "Message sent successfully",
      });
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Messages</h1>
        <Card className="p-6">Loading messages...</Card>
      </div>
    );
  }

  const filteredUsers = availableUsers.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Mail className="h-8 w-8" />
          Messages
        </h1>
        <Button onClick={handleOpenNewMessage}>
          <Plus className="h-4 w-4 mr-2" />
          New Message
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-240px)] min-h-[600px]">
        {/* Conversations List */}
        <Card className="p-4 flex flex-col h-full overflow-hidden">
          <h2 className="text-lg font-semibold mb-4 shrink-0">Conversations</h2>
          <ScrollArea className="flex-1">
            {conversations.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No messages yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedConversation === conv.id
                        ? 'bg-primary/10 border border-primary'
                        : 'hover:bg-secondary'
                    }`}
                    onClick={() => setSelectedConversation(conv.id)}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar>
                        <AvatarFallback>{getInitials(conv.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium truncate">{conv.full_name}</p>
                          {conv.unreadCount > 0 && (
                            <Badge variant="default" className="ml-auto">
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">{conv.role}</p>
                        <p className="text-sm text-muted-foreground truncate mt-1">
                          {conv.lastMessage}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTimestamp(conv.lastMessageAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Message Thread */}
        <Card className="md:col-span-2 p-4 flex flex-col h-full overflow-hidden">
          {selectedConversation ? (
            <>
              <div className="border-b pb-3 mb-4 shrink-0">
                <h2 className="text-lg font-semibold">
                  {conversations.find(c => c.id === selectedConversation)?.full_name || 'Conversation'}
                </h2>
              </div>

              <ScrollArea className="flex-1 pr-4 mb-4 min-h-0">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No messages in this conversation</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {hasMoreMessages && (
                      <div className="text-center pb-4">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={loadMoreMessages}
                        >
                          Load Earlier Messages
                        </Button>
                      </div>
                    )}
                    {messages.slice().reverse().map((message) => {
                      const isMe = message.sender_id === user?.id;
                      return (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {isMe ? <User className="h-4 w-4" /> : getInitials(message.sender.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div
                              className={`px-4 py-2 rounded-lg max-w-md ${
                                isMe
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-secondary'
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatTimestamp(message.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              <div className="flex gap-2 shrink-0">
                <Textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Type your message..."
                  className="resize-none"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageContent.trim() || sending}
                  size="icon"
                  className="h-auto"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Mail className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Select a conversation to view messages</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* New Message Dialog */}
      <Dialog open={showNewMessageDialog} onOpenChange={setShowNewMessageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="h-[400px]">
              {filteredUsers.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No users found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((usr) => (
                    <div
                      key={usr.id}
                      className="p-3 rounded-lg hover:bg-secondary cursor-pointer transition-colors"
                      onClick={() => handleSelectUser(usr.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{getInitials(usr.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{usr.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{usr.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
