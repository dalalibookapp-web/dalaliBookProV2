const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Welcome Email ────────────────────────────────────────────────

async function sendWelcomeEmail(to) {
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to,
      subject: 'Welcome! Your account is ready 🎉',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; color: #111;">
            <h2 style="margin-bottom: 8px;">Welcome aboard 👋</h2>
            <p style="color: #555;">
              Your account has been verified successfully. You can now log in and start using the app.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="color: #aaa; font-size: 12px;">
              If you didn't create this account, you can safely ignore this email.
            </p>
          </body>
        </html>
      `,
    });
    console.log(`📧 Welcome email sent to ${to}`);
  } catch (err) {
    console.error('❌ Failed to send welcome email:', err.message);
  }
}

// ── OTP Email ────────────────────────────────────────────────────

async function sendOtpEmail(to, otp) {
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to,
      subject: 'Your verification code',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; color: #111;">
            <h2 style="margin-bottom: 8px;">Verify your email</h2>
            <p style="color: #555; margin-bottom: 24px;">
              Use the code below to verify your account. It expires in <strong>10 minutes</strong>.
            </p>
            <div style="
              display: inline-block;
              background: #f4f4f5;
              border-radius: 8px;
              padding: 16px 32px;
              font-size: 36px;
              font-weight: bold;
              letter-spacing: 8px;
              color: #111;
              margin-bottom: 24px;
            ">
              ${otp}
            </div>
            <p style="color: #888; font-size: 13px;">
              Do not share this code with anyone.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="color: #aaa; font-size: 12px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </body>
        </html>
      `,
    });
    console.log(`📧 OTP email sent to ${to}`);
  } catch (err) {
    console.error('❌ Failed to send OTP email:', err.message);
    throw err; // OTP send failure is blocking unlike welcome email
  }
}

// ── Password Reset Email ─────────────────────────────────────────

async function sendPasswordResetEmail(to, resetLink) {
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to,
      subject: 'Reset your password',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; color: #111;">
            <h2 style="margin-bottom: 8px;">Reset your password</h2>
            <p style="color: #555; margin-bottom: 24px;">
              Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
            </p>
            <a href="${resetLink}" style="
              display: inline-block;
              background: #6c63ff;
              color: #fff;
              text-decoration: none;
              border-radius: 10px;
              padding: 14px 28px;
              font-size: 15px;
              font-weight: bold;
              margin-bottom: 24px;
            ">Reset Password</a>
            <p style="color: #888; font-size: 13px;">
              If the button doesn't work, copy this link into your browser:<br/>
              <a href="${resetLink}" style="color: #6c63ff;">${resetLink}</a>
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="color: #aaa; font-size: 12px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </body>
        </html>
      `,
    });
    console.log(`📧 Password reset email sent to ${to}`);
  } catch (err) {
    console.error('❌ Failed to send password reset email:', err.message);
    throw err;
  }
}

module.exports = { sendWelcomeEmail, sendOtpEmail, sendPasswordResetEmail };
