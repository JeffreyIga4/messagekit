import {
  telegramMessageOutputSchema,
  telegramMessageOptionsSchema,
  telegramSendMessageRequestSchema,
  telegramSendMessageResponseSchema,
  type TelegramMessageOutput,
  type TelegramMessageOptions,
} from "./schemas";

export async function sendTelegramMessage(
  input: TelegramMessageOptions,
): Promise<TelegramMessageOutput> {
  // validate input
  const parsedInput = telegramMessageOptionsSchema.parse(input);
  const requestBody = telegramSendMessageRequestSchema.parse({
    chat_id: parsedInput.chatId,
    text: parsedInput.message,
  });

  const response = await fetch(`https://api.telegram.org/bot${parsedInput.botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: await Response.json(requestBody).text(),
  });

  // this will throw an error if the response is not valid according to the schema
  const data = telegramSendMessageResponseSchema.parse(await response.json());

  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description ?? "Telegram API request failed");
  }

  return telegramMessageOutputSchema.parse({
    ok: true,
    chatId: parsedInput.chatId,
    messageId: data.result.message_id,
  });
}
