import nodemailer from "nodemailer";

function getSmtpConfig() {
  const rejectUnauthorized =
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false";
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? "587"),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
    rejectUnauthorized,
  };
}

function requireSmtpConfig() {
  const { host, user, password, from } = getSmtpConfig();
  if (!host || !user || !password || !from) {
    throw new Error(
      "Missing SMTP config. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM in auth-server/.env, then restart the server.",
    );
  }
  return getSmtpConfig();
}

export async function sendPasswordSetupEmail(input: {
  to: string;
  name: string;
  url: string;
}) {
  const { host, port, user, password, from, rejectUnauthorized } =
    requireSmtpConfig();

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass: password,
    },
    tls: {
      rejectUnauthorized,
    },
  });

  await transport.sendMail({
    from,
    to: input.to,
    subject: "Set your password",
    text: `Hi ${input.name},\n\nSet your password using this link:\n${input.url}\n\nIf you did not request this, you can ignore this email.`,
  });
}
