import { z } from "zod";

// what we receive from the user
export const telegramMessageInputSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  message: z.string().min(1, "Message text is required"),
});

export const telegramMessageOptionsSchema = telegramMessageInputSchema.extend({
    botToken: z.string().min(1, "Telegram bot token is required"),
});

// what we send to the Telegram API
export const telegramSendMessageRequestSchema = z.object({
    chat_id: z.string().min(1),
    text: z.string().min(1),
});

// validation schema for the response we receive from the Telegram API
export const telegramSendMessageResponseSchema = z.object({
    ok: z.boolean(),
    result: z.object({
        message_id: z.number(),
    }).optional(),
    description: z.string().optional(),
});


export const telegramSendMessageOutputSchema = z.object({
    ok: z.literal(true),
    chatId: z.string(),
    messageId: z.number(),
});
