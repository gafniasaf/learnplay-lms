/**
 * Inbox - IgniteZero compliant messaging
 * Uses API layer for data, retains Supabase realtime for live updates
 */
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useMessaging } from "@/hooks/useMessaging";
import { useMCP } from "@/hooks/useMCP";
import { Send, Mail, User, Plus, Search, RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getRole } from "@/lib/roles";
import { createLogger } from "@/lib/logger";

const logger = createLogger('Inbox');

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
  const messaging = useMessaging();
  const mcp = useMCP();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState("");
  const [showNewMessageDialog, setShowNewMessageDialog] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<Array<{id: string; name: string; role: string}>>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [messageOffset, setMessageOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // Use local role system instead of direct DB query
  const userRole = getRole();

  // Get conversations from hook
  const conversationsData = messaging.conversations;
  const conversations = (conversationsData.data as unknown as { conversations?: Conversation[] })?.conversations ?? [];

  // Get messages for selected conversation
  const messagesQuery = messaging.useMessages(selectedConversation || '');
  const messages = (messagesQuery?.data as unknown as { messages?: Message[] })?.messages ?? [];

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    if (!user?.id) return;
    
    try {
      const data = await mcp.listMessages(conversationId, 20);
      
      // Messages are loaded via hook query
    } catch (error) {
      logger.error('Error loading messages', error instanceof Error ? error : new Error(String(error)), { action: 'loadMessages' });
      toast({ title: "Error", description: "Failed to load messages", variant: "destructive" });
    }
  }, [user?.id, toast, mcp]);

  // Poll for conversation updates (replaces realtime)
  useEffect(() => {
    if (!user?.id) return;
    
    const interval = setInterval(() => {
      messaging.conversations.refetch();
      if (selectedConversation) {
        messagesQuery?.refetch();
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [user?.id, selectedConversation, messaging, messagesQuery]);

  const loadAvailableUsers = async () => {
    try {
      if (userRole === "teacher" || userRole === "school" || userRole === "admin") {
        // Use MCP for student list
        const data = await mcp.listOrgStudents();
        setAvailableUsers((data as { students: Array<{ id: string; name: string }> }).students.map(s => ({ id: s.id, name: s.name, role: "student" })));
      } else if (userRole === "student") {
        // For students, show empty list - they can only reply to messages
        // Full teacher list would require additional edge function
        setAvailableUsers([]);
        toast({ 
          title: "Info", 
          description: "Students can reply to existing conversations. Start a new chat from your teacher's dashboard.",
          variant: "default"
        });
      }
    } catch (error) {
      logger.error('Error loading available users', error instanceof Error ? error : new Error(String(error)), { action: 'loadUsers' });
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

  const handleLoadMore = async () => {
    if (selectedConversation && hasMoreMessages) {
      const newOffset = messageOffset + 20;
      setMessageOffset(newOffset);
      // Refetch messages - offset handled by hook
      messagesQuery?.refetch();
    }
  };

  const handleSendMessage = async () => {
    if (!messageContent.trim() || !selectedConversation || !user?.id) return;
    
    setSending(true);
    try {
      await messaging.sendMessage.mutateAsync({ recipientId: selectedConversation, content: messageContent.trim() });
      
      setMessageContent("");
      messagesQuery?.refetch();
      messaging.conversations.refetch(); // Update conversation list
      toast({ title: "Sent", description: "Message sent successfully" });
    } catch (error) {
      logger.error('Error sending message', error instanceof Error ? error : new Error(String(error)), { action: 'sendMessage' });
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const filteredUsers = availableUsers.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedUser = conversations.find(c => c.id === selectedConversation);

  if (!user) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Please sign in to view your messages</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6" />
          Inbox
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => messaging.conversations.refetch()} data-cta-id="refresh-inbox" data-action="click">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={handleOpenNewMessage} data-cta-id="new-message" data-action="click">
            <Plus className="h-4 w-4 mr-2" />
            New Message
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100%-3rem)]">
        {/* Conversations List */}
        <Card className="md:col-span-1 overflow-hidden">
          <div className="p-3 border-b">
            <h2 className="font-semibold">Conversations</h2>
          </div>
          <ScrollArea className="h-[calc(100%-3rem)]">
            {conversationsData.isLoading ? (
              <div className="p-4 text-center text-muted-foreground">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              <div className="divide-y">
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv.id)}
                    className={`w-full p-3 text-left hover:bg-muted transition-colors ${
                      selectedConversation === conv.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {conv.full_name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">{conv.full_name}</span>
                          {conv.unreadCount > 0 && (
                            <Badge variant="default" className="ml-2">
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {conv.lastMessage}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Messages Area */}
        <Card className="md:col-span-2 flex flex-col overflow-hidden">
          {selectedConversation ? (
            <>
              <div className="p-3 border-b flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {selectedUser?.full_name?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <span className="font-semibold">{selectedUser?.full_name || 'User'}</span>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {selectedUser?.role || 'user'}
                  </Badge>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                {hasMoreMessages && (
                  <div className="text-center mb-4">
                    <Button variant="ghost" size="sm" onClick={handleLoadMore}>
                      Load older messages
                    </Button>
                  </div>
                )}
                
                <div className="space-y-4">
                  {messages.map(msg => {
                    const isOwn = msg.sender_id === user.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            isOwn
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <p className="text-sm">{msg.content}</p>
                          <p className={`text-xs mt-1 ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <Textarea
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder="Type a message..."
                    className="min-h-[2.5rem] max-h-32 resize-none"
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
                    data-cta-id="send-message"
                    data-action="click"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search users..."
                className="pl-10"
              />
            </div>
            <ScrollArea className="h-60">
              {filteredUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  {userRole === 'student' 
                    ? 'Start conversations by replying to messages from your teacher'
                    : 'No users found'
                  }
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredUsers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleSelectUser(u.id)}
                      className="w-full p-3 text-left hover:bg-muted rounded-lg transition-colors flex items-center gap-3"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.role}</p>
                      </div>
                    </button>
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
