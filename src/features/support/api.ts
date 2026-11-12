import { db } from "../../lib/supabase";
export type Message = {
  id: string;
  body: string;
  sender_id?: string;
  created_at?: string;
};
export type SendInput = {
  conversationId: string;
  body: string;
  clientMessageId: string;
};
export type MessageRepository = {
  insert: (
    input: SendInput,
  ) => Promise<{ message: Message | null; duplicate: boolean }>;
  find: (input: SendInput) => Promise<Message>;
};
const repository: MessageRepository = {
  insert: async (input) => {
    const { data, error } = await db()
      .from("support_messages")
      .insert({
        conversation_id: input.conversationId,
        body: input.body,
        client_message_id: input.clientMessageId,
      })
      .select("*")
      .single();
    if (error && error.code !== "23505") throw error;
    return { message: data, duplicate: error?.code === "23505" };
  },
  find: async (input) => {
    const {
      data: { user },
    } = await db().auth.getUser();
    if (!user) throw new Error("session");
    const { data, error } = await db()
      .from("support_messages")
      .select("*")
      .eq("sender_id", user.id)
      .eq("client_message_id", input.clientMessageId)
      .eq("conversation_id", input.conversationId)
      .single();
    if (error) throw error;
    return data;
  },
};
export async function sendMessage(
  input: SendInput,
  repo: MessageRepository = repository,
): Promise<Message> {
  if (!input.body.trim() || input.body.length > 5000)
    throw new Error("invalid_message");
  const result = await repo.insert(input);
  if (result.duplicate) return repo.find(input);
  if (!result.message) throw new Error("not_saved");
  return result.message;
}
export async function startConversation(subject: string, requestId: string) {
  const { data, error } = await db()
    .from("support_conversations")
    .insert({ subject: subject.trim(), client_request_id: requestId })
    .select("id")
    .single();
  if (!error) return data.id as string;
  if (error.code !== "23505") throw error;
  const { data: previous, error: readError } = await db()
    .from("support_conversations")
    .select("id")
    .eq("client_request_id", requestId)
    .single();
  if (readError) throw readError;
  return previous.id as string;
}
