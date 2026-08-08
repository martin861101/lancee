import nodemailer from 'nodemailer'
import { businessIdentity } from './business.mjs'

const BRAND_GRADIENT =
  'linear-gradient(125deg,#ff706f 0%,#ee45aa 34%,#6854e8 67%,#43bdf4 100%)'
const FONT_FAMILY =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const FOOTER_BLURB = 'your operating system for client work'

let transporter

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatMoney(amountMinor, currency) {
  const code = String(currency || 'ZAR').toUpperCase()
  const amount = Number(amountMinor || 0) / 100
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${code} ${amount.toFixed(2)}`
  }
}

function emailShell({
  preheader,
  eyebrow,
  title,
  greeting,
  bodyHtml,
  ctaText,
  ctaUrl,
  note,
  footer,
}) {
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:#f3f4ef;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>`
    : ''
  const eyebrowHtml = eyebrow
    ? `<td align="right" style="padding:0;color:#9aa097;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-family:${FONT_FAMILY};vertical-align:middle;">${escapeHtml(eyebrow)}</td>`
    : ''
  const ctaHtml =
    ctaText && ctaUrl
      ? `<tr><td align="center" style="padding:28px 40px 4px;">
           <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
             <tr><td style="border-radius:12px;">
               <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:15px 34px;border-radius:12px;background:${BRAND_GRADIENT};color:#ffffff;font-family:${FONT_FAMILY};font-size:15px;font-weight:600;line-height:1;text-decoration:none;letter-spacing:.2px;">${escapeHtml(ctaText)}</a>
             </td></tr>
           </table>
         </td></tr>`
      : ''
  const noteHtml = note
    ? `<tr><td style="padding:16px 40px 0;color:#9aa097;font-size:12px;line-height:1.65;font-family:${FONT_FAMILY};">${escapeHtml(note)}</td></tr>`
    : ''
  const footerLine = footer || businessIdentity.platformLegalStyle

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4ef;-webkit-text-size-adjust:100%;">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4ef;margin:0;padding:0;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:600px;">
      <tr>
        <td style="padding:0 0 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="32" height="32" style="width:32px;height:32px;border-radius:9px;background:${BRAND_GRADIENT};font-family:${FONT_FAMILY};font-size:17px;font-weight:700;color:#ffffff;text-align:center;vertical-align:middle;line-height:32px;">l</td>
                    <td style="padding-left:10px;font-family:${FONT_FAMILY};font-size:19px;font-weight:700;color:#151713;letter-spacing:-.02em;vertical-align:middle;">lancee</td>
                  </tr>
                </table>
              </td>
              ${eyebrowHtml}
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background-color:#ffffff;border-radius:18px;box-shadow:0 18px 54px rgba(20,24,17,.08),0 3px 12px rgba(20,24,17,.05);">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="height:5px;font-size:0;line-height:0;background:${BRAND_GRADIENT};"></td></tr>
            <tr><td style="padding:30px 40px 2px;">
              <h1 style="margin:0;font-family:${FONT_FAMILY};font-size:24px;line-height:1.3;font-weight:700;color:#151713;letter-spacing:-.01em;">${escapeHtml(title)}</h1>
            </td></tr>
            ${greeting ? `<tr><td style="padding:20px 40px 0;font-family:${FONT_FAMILY};font-size:15px;line-height:1.75;color:#3e433b;">${escapeHtml(greeting)}</td></tr>` : ''}
            <tr><td style="padding:6px 40px 0;font-family:${FONT_FAMILY};font-size:15px;line-height:1.75;color:#3e433b;">${bodyHtml}</td></tr>
            ${ctaHtml}
            ${noteHtml}
            <tr><td style="height:12px;font-size:0;line-height:0;"></td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:28px 16px 8px;font-family:${FONT_FAMILY};font-size:12px;line-height:1.7;color:#9aa097;">
          <span style="font-weight:600;color:#73786f;">${escapeHtml(businessIdentity.platformName)}</span> &nbsp;·&nbsp; ${FOOTER_BLURB}<br>
          ${escapeHtml(footerLine)}
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:0 16px 8px;font-family:${FONT_FAMILY};font-size:11px;line-height:1.7;color:#b6bab0;">
          You're receiving this because of activity on lancee. If this email wasn't expected, you can safely ignore it.
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

export function registrationEmail({ name, confirmationUrl }) {
  const text =
    `Hi ${name},\n\n` +
    `Thanks for starting your lancee workspace. Confirm your email address and choose a password to finish setting up your account.\n\n` +
    `Confirm your email address:\n${confirmationUrl}\n\n` +
    `This link expires in 24 hours. If you didn't request this, you can safely ignore this email.`
  const html = emailShell({
    preheader: 'Confirm your email address and finish setting up your lancee workspace.',
    eyebrow: 'Welcome',
    title: 'Confirm your email address',
    greeting: `Hi ${name},`,
    bodyHtml:
      `Thanks for starting your <strong>lancee</strong> workspace. Confirm your email address and choose a password to finish setting up your account.`,
    ctaText: 'Confirm my account',
    ctaUrl: confirmationUrl,
    note: "This link expires in 24 hours. If you didn't request this, you can safely ignore this email.",
  })
  return { text, html }
}

export function invitationEmail({ name, inviterName, workspaceName, acceptUrl }) {
  const text =
    `Hi ${name},\n\n` +
    `${inviterName} invited you to join ${workspaceName} on lancee.\n\n` +
    `Accept the invitation within 7 days:\n${acceptUrl}`
  const html = emailShell({
    preheader: `${inviterName} invited you to join ${workspaceName} on lancee.`,
    eyebrow: 'Invitation',
    title: `You're invited to ${workspaceName}`,
    greeting: `Hi ${name},`,
    bodyHtml: `${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(workspaceName)}</strong> on lancee. Accept the invitation within 7 days to start collaborating on client work.`,
    ctaText: 'Accept invitation',
    ctaUrl: acceptUrl,
    note: 'This invitation link expires in 7 days.',
  })
  return { text, html }
}

export function clientReviewEmail({ clientName, workspaceName, title, body, reviewUrl }) {
  const bodyHtml = escapeHtml(body).replaceAll('\n', '<br>')
  const text =
    `Hi ${clientName},\n\n` +
    `${body}\n\n` +
    `Review and respond:\n${reviewUrl}\n\n` +
    `This review link expires in 14 days.`
  const html = emailShell({
    preheader: `${workspaceName}: ${title}`,
    eyebrow: workspaceName,
    title,
    greeting: `Hi ${clientName},`,
    bodyHtml,
    ctaText: 'Review for your approval',
    ctaUrl: reviewUrl,
    note: 'This review link expires in 14 days.',
  })
  return { text, html }
}

export function invoiceEmail({ clientName, workspaceName, description, invoiceNumber, paymentUrl, amountMinor, currency }) {
  const amount = formatMoney(amountMinor, currency)
  const text =
    `${clientName ? `Hi ${clientName},\n\n` : ''}` +
    `${description}\n\n` +
    `Amount due: ${amount}\n` +
    `Pay this invoice:\n${paymentUrl}`
  const html = emailShell({
    preheader: `Invoice ${invoiceNumber} from ${workspaceName}`,
    eyebrow: workspaceName,
    title: `Invoice ${invoiceNumber}`,
    greeting: clientName ? `Hi ${clientName},` : '',
    bodyHtml:
      `<p style="margin:0 0 14px;">${escapeHtml(description)}</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f8f9f5;border:1px solid #e5e7df;border-radius:12px;margin:0 0 6px;"><tr><td style="padding:14px 18px;font-family:${FONT_FAMILY};font-size:15px;color:#3e433b;">Amount due</td><td align="right" style="padding:14px 18px;font-family:${FONT_FAMILY};font-size:16px;font-weight:700;color:#151713;">${escapeHtml(amount)}</td></tr></table>`,
    ctaText: 'Pay invoice',
    ctaUrl: paymentUrl,
    note: `Invoice ${invoiceNumber} was issued by ${workspaceName} through lancee.`,
  })
  return { text, html }
}

export function testEmail() {
  const text = 'SMTP notifications are configured correctly for lancee. Your platform is ready to send transactional email.'
  const html = emailShell({
    preheader: 'Your lancee SMTP notifications are working.',
    eyebrow: 'Test message',
    title: 'Notifications are working',
    bodyHtml:
      `SMTP notifications are configured correctly for <strong>lancee</strong>. Your platform is ready to send transactional email to clients and team members.`,
    note: 'This is a test message — no action is needed.',
  })
  return { text, html }
}



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
