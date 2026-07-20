import {Command} from "commander";

const program = new Command();

program
  .name("sendkit")
  .description("A CLI tool for SendKit")
  .command("telegram")
  .description("Send a message via Telegram")
  .argument("chatId>", "Telegram chat ID")
  .argument("message>", "Message text to send")
  .action(async (chatId: string, message: string) => {
    console.log("chatId", chatId);
    console.log("message", message);
    process.exit(1);
  });

  program.parse(process.argv);