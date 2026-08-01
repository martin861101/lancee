import nodemailer from 'nodemailer'

let transporter

function enabled() {
  return process.env.SMTP_ENABLED === 'true'
}

function configured() {
  return Boolean(
    enabled() &&
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_FROM_EMAIL,
  )
}

function getTransporter() {
  if (!configured()) {
    const error = new Error('SMTP notifications are not configured.')
    error.code = 'SMTP_NOT_CONFIGURED'
    throw error
  }

  if (!transporter) {
    const hasCredentials = Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD)
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number.parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: hasCredentials
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  }

  return transporter
}

export function getSmtpStatus() {
  return {
    enabled: enabled(),
    configured: configured(),
    hostConfigured: Boolean(process.env.SMTP_HOST),
    credentialsConfigured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD),
    fromConfigured: Boolean(process.env.SMTP_FROM_EMAIL),
  }
}

export async function sendNotification({ to, subject, text, html, attachments }) {
  if (!to || !subject || !text) {
    throw new Error('Notification recipient, subject, and text are required.')
  }

  return getTransporter().sendMail({
    from: {
      name: process.env.SMTP_FROM_NAME || 'lancee',
      address: process.env.SMTP_FROM_EMAIL,
    },
    replyTo: process.env.SMTP_REPLY_TO || undefined,
    to,
    subject,
    text,
    html,
    attachments,
  })
}
