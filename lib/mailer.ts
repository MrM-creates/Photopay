import nodemailer from "nodemailer";
import { readEnvSmtpSettings, type SmtpSettings } from "@/lib/email-settings";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

function createTransporter(config: SmtpSettings) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

function getDefaultTransporter() {
  const config = readEnvSmtpSettings();
  if (!config) {
    throw new Error("MAIL_NOT_CONFIGURED");
  }
  if (cachedTransporter) return { transporter: cachedTransporter, config };
  cachedTransporter = createTransporter(config);
  return { transporter: cachedTransporter, config };
}

export async function sendMail(input: SendMailInput, smtpSettings?: SmtpSettings) {
  const config = smtpSettings ?? getDefaultTransporter().config;
  const transporter = smtpSettings ? createTransporter(smtpSettings) : getDefaultTransporter().transporter;

  try {
    const info = await transporter.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      replyTo: config.replyTo,
    });
    return {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "MAIL_NOT_CONFIGURED") {
      throw error;
    }
    throw new Error("EMAIL_SEND_FAILED");
  }
}
