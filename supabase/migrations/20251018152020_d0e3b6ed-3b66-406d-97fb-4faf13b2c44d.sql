-- Create messages table
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  CONSTRAINT messages_content_length CHECK (char_length(content) > 0 AND char_length(content) <= 2000)
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users can send messages (insert where they are the sender)
CREATE POLICY "users can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = sender_id);

-- Users can view messages where they are sender or recipient
CREATE POLICY "users can view their messages"
ON public.messages
FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Users can mark messages as read (update only read_at field)
CREATE POLICY "users can mark received messages as read"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

-- Create index for faster message queries
CREATE INDEX idx_messages_recipient_created ON public.messages(recipient_id, created_at DESC);
CREATE INDEX idx_messages_sender_created ON public.messages(sender_id, created_at DESC);