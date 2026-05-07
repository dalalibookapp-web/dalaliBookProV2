const bcrypt = require('bcrypt');
const pool = require('../config/db');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
} = require('../utils/tokens');
const { sendWelcomeEmail, sendOtpEmail } = require('../utils/mailer');
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
      'SELECT id, email, password_hash, is_verified,secret_hash_check FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

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

module.exports = { register, verifyOtp, resendOtp, login, refresh, logout, me };