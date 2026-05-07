const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

// ── Generate Tokens ──────────────────────────────────────────────

function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m',
  });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  });
}

// ── Verify Tokens ────────────────────────────────────────────────

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
}

// ── Hash Token (for safe DB storage) ────────────────────────────

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Get expiry date for refresh token ───────────────────────────

function getRefreshTokenExpiry() {
  const days = parseInt(process.env.REFRESH_TOKEN_EXPIRY || '7d');
  const date = new Date();
  date.setDate(date.getDate() + (isNaN(days) ? 7 : days));
  return date;
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
};
