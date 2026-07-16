import "dotenv/config";
import { sendPasswordSetupEmail } from "../src/mail.ts";

async function main() {
  try {
    await sendPasswordSetupEmail({
      to: process.env.SMTP_USER ?? "test@example.com",
      name: "SMTP Test",
      url: "http://localhost:3000/set-password?token=test",
    });
    console.log("EMAIL_SENT_OK");
  } catch (error) {
    console.error("EMAIL_FAILED:", error);
    process.exit(1);
  }
}

void main();
