import nodemailer from "nodemailer";
import { config } from "./config.js";

const { host, port, secure, user, pass, from } = config.smtp;

const transporter = host
  ? nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined })
  : null;

if (!transporter && !config.isTest) {
  console.warn(
    "[AVISO] SMTP_HOST não configurado: e-mails de recuperação de senha não serão enviados, " +
    "apenas registrados no log do servidor. Configure SMTP_* antes de liberar o acesso remoto."
  );
}

export function isEmailConfigured() {
  return Boolean(transporter);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function sendPasswordResetEmail(to, link) {
  if (!transporter) {
    if (config.isTest) globalThis.__lastResetLink = link; // só nos testes automatizados
    if (!config.isTest) console.log(`[reset-password] SMTP não configurado. Link de recuperação para ${to}: ${link}`);
    return { delivered: false };
  }
  const safe = escapeHtml(link);
  await transporter.sendMail({
    from,
    to,
    subject: "Recuperação de senha - DBLAPOGE",
    text: "Você solicitou a redefinição de senha da sua conta no DBLAPOGE.\n\n" +
      `Use o link abaixo para definir uma nova senha (válido por 1 hora):\n${link}\n\n` +
      "Se você não fez essa solicitação, ignore este e-mail.",
    html: "<p>Você solicitou a redefinição de senha da sua conta no <strong>DBLAPOGE</strong>.</p>" +
      "<p>Use o link abaixo para definir uma nova senha (válido por 1 hora):</p>" +
      `<p><a href="${safe}">${safe}</a></p>` +
      "<p>Se você não fez essa solicitação, ignore este e-mail.</p>",
  });
  return { delivered: true };
}
