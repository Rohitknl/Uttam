/**
 * Email delivery for OTP.
 * Configure SMTP_* in backend/.env (e.g. Gmail App Password).
 * If SMTP is not configured, returns channel "local" so the UI can show the OTP.
 */

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function emailsMatch(a, b) {
  const ea = normalizeEmail(a);
  const eb = normalizeEmail(b);
  return Boolean(ea && eb && ea === eb);
}

export function maskEmail(email) {
  const e = normalizeEmail(email);
  const at = e.indexOf('@');
  if (at < 1) return '****';
  const user = e.slice(0, at);
  const domain = e.slice(at);
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${'*'.repeat(Math.max(1, user.length - visible.length))}${domain}`;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export async function sendOtpEmail(toEmail, otp, purposeLabel = 'password reset') {
  const to = normalizeEmail(toEmail);
  if (!isValidEmail(to)) {
    throw new Error('Invalid email address');
  }

  const subject = `Uttam Laboratories — ${purposeLabel} OTP`;
  const text = `Your Uttam Laboratories ${purposeLabel} OTP is ${otp}.\n\nValid for 10 minutes. Do not share this code.`;
  const html = `
    <p>Your Uttam Laboratories <strong>${purposeLabel}</strong> OTP is:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p>
    <p>Valid for 10 minutes. Do not share this code.</p>
  `;

  const host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (host && user && pass) {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: from || user,
      to,
      subject,
      text,
      html,
    });
    return { channel: 'email', emailMasked: maskEmail(to) };
  }

  console.log(`[OTP EMAIL local] to=${to} otp=${otp} (${purposeLabel})`);
  return {
    channel: 'local',
    emailMasked: maskEmail(to),
    otp,
  };
}
