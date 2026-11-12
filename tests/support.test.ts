import { it, expect, vi } from "vitest";
import {
  sendMessage,
  type MessageRepository,
} from "../src/features/support/api";
const input = {
  conversationId: "c",
  body: "Preciso de ajuda",
  clientMessageId: "b7c77d14-7f70-4de5-a355-bc62733d2077",
};
it("does not send empty messages", async () => {
  const repo = { insert: vi.fn(), find: vi.fn() };
  await expect(sendMessage({ ...input, body: "   " }, repo)).rejects.toThrow();
  expect(repo.insert).not.toHaveBeenCalled();
});
it("recovers a previous successful send after duplicate retry", async () => {
  const message = { id: "m", ...input };
  const repo: MessageRepository = {
    insert: async () => ({ message: null, duplicate: true }),
    find: async () => message,
  };
  expect(await sendMessage(input, repo)).toEqual(message);
});
it("preserves caller draft on failed send", async () => {
  const repo = {
    insert: async () => {
      throw new Error("offline");
    },
    find: vi.fn(),
  };
  await expect(sendMessage(input, repo)).rejects.toThrow();
  expect(input.body).toBe("Preciso de ajuda");
  expect(input.clientMessageId).toBe("b7c77d14-7f70-4de5-a355-bc62733d2077");
});
