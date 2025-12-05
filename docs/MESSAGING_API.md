# Messaging API

High-signal docs for messaging endpoints. All paths are under `/functions/v1/*`. Auth required.

- send-message (POST)
  - Body:
    ```ts
    {
      toUserId: string;             // or conversationId
      conversationId?: string;      // optional existing conversation
      subject?: string;
      body: string;
    }
    ```
  - Returns:
    ```ts
    { messageId: string; conversationId: string; sentAt: string }
    ```

- list-conversations (GET)
  - Query: `limit?`, `cursor?`
  - Returns:
    ```ts
    { conversations: Array<{ id: string; title?: string; lastMessageAt: string; unreadCount: number }>; nextCursor?: string | null }
    ```

- list-messages (GET)
  - Query: `conversationId`, `limit?`, `cursor?`
  - Returns:
    ```ts
    { messages: Array<{ id: string; conversationId: string; fromUserId: string; body: string; createdAt: string }>; nextCursor?: string | null }
    ```

Notes
- Typical flow: list-conversations -> list-messages(conversationId) -> send-message.
- RLS restricts visibility: users can only access their own conversations and messages.
- For exact fields/constraints, see `supabase/functions/send-message`, `list-messages`, and `list-conversations`.
