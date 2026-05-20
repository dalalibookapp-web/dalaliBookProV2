const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
} = require('../utils/tokens');
const { sendWelcomeEmail, sendOtpEmail, sendPasswordResetEmail } = require('../utils/mailer');
const { generateOtp, hashOtp, getOtpExpiry } = require('../utils/otp');

const SALT_ROUNDS = 12;

async function issueTokens(userId, email) {
  const payload = { id: userId, email };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = getRefreshTokenExpiry();

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  return { accessToken, refreshToken };
}

async function createAndSendOtp(userId, email) {
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = getOtpExpiry();

  console.log(otp)
  await pool.query(
    'UPDATE otps SET used = TRUE WHERE user_id = $1 AND used = FALSE',
    [userId]
  );

  await pool.query(
    `INSERT INTO otps (user_id, otp_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, otpHash, expiresAt]
  );

  await sendOtpEmail(email, otp);
}

async function register(req, res) {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const existing = await pool.query(
      'SELECT id, is_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      if (!user.is_verified) {
        await createAndSendOtp(user.id, email.toLowerCase());
        return res.status(200).json({
          message: 'Account already exists but is unverified. A new OTP has been sent.',
        });
      }
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at`,
      [email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    await createAndSendOtp(user.id, user.email);

    return res.status(201).json({
      message: 'Account created. Please verify your email with the OTP sent to your inbox.',
      email: user.email,
    });
  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function verifyOtp(req, res) {
  const { email, otp , secret_hash_email } = req.body;

  console.log(secret_hash_email)
  

  if (!email || !otp)
    return res.status(400).json({ error: 'Email and OTP are required' });

  try {
    const userResult = await pool.query(
      'SELECT id, email, is_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_verified)
      return res.status(400).json({ error: 'Email already verified. Please log in.' });

    const otpHash = hashOtp(otp);
    const otpResult = await pool.query(
      `SELECT id, expires_at, used FROM otps WHERE user_id = $1 AND otp_hash = $2`,
      [user.id, otpHash]
    );

    const storedOtp = otpResult.rows[0];
    if (!storedOtp) return res.status(401).json({ error: 'Invalid OTP' });
    if (storedOtp.used) return res.status(401).json({ error: 'OTP has already been used' });
    if (new Date(storedOtp.expires_at) < new Date())
      return res.status(401).json({ error: 'OTP has expired' });

    await pool.query('UPDATE otps SET used = TRUE WHERE id = $1', [storedOtp.id]);
    await pool.query('UPDATE users SET is_verified = TRUE , secret_hash_check = $2 WHERE id = $1', [user.id, secret_hash_email]);

    const { accessToken, refreshToken } = await issueTokens(user.id, user.email);
    // sendWelcomeEmail(user.email);

    return res.status(200).json({
      message: 'Email verified successfully',
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Verify OTP error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function resendOtp(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const result = await pool.query(
      'SELECT id, email, is_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_verified)
      return res.status(400).json({ error: 'Email already verified. Please log in.' });

    await createAndSendOtp(user.id, user.email);
    return res.status(200).json({ message: 'OTP resent to your email' });
  } catch (err) {
    console.error('Resend OTP error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function login(req, res) {
  const { email, password ,secret_hash_email} = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, is_verified,secret_hash_check,account_type,premium_expires_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

   console.log(user)
  const isPremium = Boolean(
  user.account_type === "premium" &&
  new Date(user.premium_expires_at) > new Date()
);

if(!isPremium){
  return res.status(405).json({
    error:`Your account has been verified successfully, but access is currently pending approval.

Please contact the admin to activate your account`  })
}
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) return res.status(401).json({ error: 'Invalid email or password' });

    if (!user.is_verified)
      return res.status(403).json({
        error: 'Email not verified. Please verify your email before logging in.',
      });
        console.log(user)

      const secret_hash_check = user.secret_hash_check;
     
      if(secret_hash_check !==secret_hash_email){
        return res.status(403).json({
          error: 'Secret phrase does not match. Please verify your email with the correct secret phrase.',
        });
      }

    

    const { accessToken, refreshToken } = await issueTokens(user.id, user.email);

    return res.status(200).json({
      message: 'Logged in successfully',
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

  try {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const tokenHash = hashToken(refreshToken);
    const result = await pool.query(
      `SELECT id, user_id, revoked, expires_at FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash]
    );

    const storedToken = result.rows[0];
    if (!storedToken) return res.status(401).json({ error: 'Refresh token not found' });

    if (storedToken.revoked) {
      await pool.query(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1',
        [storedToken.user_id]
      );
      return res.status(401).json({ error: 'Refresh token reuse detected. All sessions revoked.' });
    }

    if (new Date(storedToken.expires_at) < new Date())
      return res.status(401).json({ error: 'Refresh token expired' });

    await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [storedToken.id]);

    const { accessToken, refreshToken: newRefreshToken } = await issueTokens(decoded.id, decoded.email);

    return res.status(200).json({
      message: 'Tokens refreshed',
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error('Refresh error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function logout(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

  try {
    const tokenHash = hashToken(refreshToken);
    await pool.query(
      'UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1',
      [tokenHash]
    );
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND is_verified = TRUE',
      [email.toLowerCase()]
    );

    // Always respond 200 — don't reveal whether the email exists
    if (result.rows.length === 0) {
      return res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
    }

    const user = result.rows[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_token_hash = $1, reset_token_expires_at = $2 WHERE id = $3',
      [tokenHash, expiresAt, user.id]
    );

    const resetLink = `${process.env.BASE_URL}/auth/reset-password?token=${rawToken}`;
    console.log(resetLink)
    await sendPasswordResetEmail(email.toLowerCase(), resetLink);

    return res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function resetFormHtml(token) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Password</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0f13; color: #f0f0f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #13131a; border-radius: 20px; padding: 40px 32px; width: 100%; max-width: 400px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
    p { color: #555568; font-size: 14px; margin-bottom: 28px; }
    label { display: block; font-size: 11px; font-weight: 600; color: #888899; text-transform: uppercase; letter-spacing: 0.9px; margin-bottom: 7px; }
    .input-wrap { position: relative; margin-bottom: 18px; }
    .input-wrap input { width: 100%; background: #18181f; border: 1px solid #26262f; border-radius: 11px; color: #f0f0f5; font-size: 15px; padding: 13px 44px 13px 14px; outline: none; }
    .input-wrap input:focus { border-color: #6c63ff; }
    .eye-btn { position: absolute; right: 13px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 17px; padding: 4px; line-height: 1; width: auto; }
    .eye-btn:hover { opacity: 0.7; }
    .submit-btn { width: 100%; background: #6c63ff; color: #fff; border: none; border-radius: 13px; padding: 15px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 4px; }
    .submit-btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Reset Password</h1>
    <p>Enter your new password below.</p>
    <form method="POST" action="/auth/reset-password">
      <input type="hidden" name="token" value="${token}" />

      <label>New Password</label>
      <div class="input-wrap">
        <input type="password" id="password" name="password" placeholder="At least 8 characters" required minlength="8" />
        <button type="button" class="eye-btn" onclick="toggleVisibility('password', this)">👁️</button>
      </div>

      <label>Confirm Password</label>
      <div class="input-wrap">
        <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Repeat your password" required minlength="8" />
        <button type="button" class="eye-btn" onclick="toggleVisibility('confirmPassword', this)">👁️</button>
      </div>

      <button type="submit" class="submit-btn">Set New Password</button>
    </form>
  </div>
  <script>
    function toggleVisibility(id, btn) {
      var input = document.getElementById(id);
      var isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.textContent = isHidden ? '🙈' : '👁️';
    }
  </script>
</body>
</html>`;
}

function resultHtml(title, message, isError = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f0f13; color: #f0f0f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #13131a; border-radius: 20px; padding: 40px 32px; width: 100%; max-width: 400px; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 12px; }
    p { color: #555568; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isError ? '❌' : '✅'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

async function showResetForm(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(resultHtml('Invalid Link', 'No reset token provided.', true));
  }

  const tokenHash = hashToken(token);
  const result = await pool.query(
    'SELECT id FROM users WHERE reset_token_hash = $1 AND reset_token_expires_at > NOW()',
    [tokenHash]
  );

  if (result.rows.length === 0) {
    return res.status(400).send(resultHtml('Link Expired', 'This password reset link is invalid or has expired. Please request a new one from the app.', true));
  }

  return res.send(resetFormHtml(token));
}

async function handleResetPassword(req, res) {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || !confirmPassword) {
    return res.status(400).send(resultHtml('Missing Fields', 'All fields are required.', true));
  }

  if (password !== confirmPassword) {
    return res.status(400).send(resultHtml('Passwords Do Not Match', 'The passwords you entered do not match. Please go back and try again.', true));
  }

  if (password.length < 8) {
    return res.status(400).send(resultHtml('Password Too Short', 'Password must be at least 8 characters.', true));
  }

  try {
    const tokenHash = hashToken(token);
    const result = await pool.query(
      'SELECT id FROM users WHERE reset_token_hash = $1 AND reset_token_expires_at > NOW()',
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).send(resultHtml('Link Expired', 'This password reset link is invalid or has expired. Please request a new one from the app.', true));
    }

    const user = result.rows[0];
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = $2',
      [passwordHash, user.id]
    );

    return res.send(resultHtml('Password Updated', 'Your password has been changed successfully. You can now log in with your new password.'));
  } catch (err) {
    console.error('Reset password error:', err.message);
    return res.status(500).send(resultHtml('Server Error', 'Something went wrong. Please try again later.', true));
  }
}

async function me(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, email, is_verified, account_type, premium_expires_at, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        isVerified: user.is_verified,
        accountType: user.account_type,
        premiumExpiresAt: user.premium_expires_at,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('Me error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { register, verifyOtp, resendOtp, login, refresh, logout, me, forgotPassword, showResetForm, handleResetPassword };