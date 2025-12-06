import { callEdgeFunctionGet } from "./common";

/**
 * Send a message to a user
 */
export async function sendMessage(
  recipientId: string,
  content: string
): Promise<any> {
  console.info(`[sendMessage] Sending message to ${recipientId}`);

  const { supabase } = await import("@/integrations/supabase/client");

  const { data, error } = await supabase.functions.invoke("send-message", {
    body: { recipientId, content },
  });

  if (error) {
    console.error("[sendMessage][error]", error);
    throw error;
  }

  console.info("[sendMessage][ok]");
  return data;
}

/**
 * List conversations for current user
 */
export async function listConversations(): Promise<any> {
  console.info("[listConversations] Loading conversations");

  const data = await callEdgeFunctionGet<any>("list-conversations");

  console.info(
    "[listConversations][ok]",
    `Loaded ${data?.conversations?.length || 0} conversations`
  );

  return data;
}

/**
 * List messages for current user, optionally filtered by conversation
 */
export async function listMessages(
  conversationWith?: string,
  options?: { limit?: number; offset?: number }
): Promise<any> {
  console.info(
    `[listMessages] Loading messages${conversationWith ? ` with ${conversationWith}` : ""}`,
    options
  );

  const params: Record<string, string> = {};
  if (conversationWith) params.conversationWith = conversationWith;
  if (options?.limit) params.limit = options.limit.toString();
  if (options?.offset) params.offset = options.offset.toString();

  const data = await callEdgeFunctionGet<any>("list-messages", params);

  console.info(
    "[listMessages][ok]",
    `Loaded ${data?.messages?.length || 0} messages`
  );

  return data;
}
