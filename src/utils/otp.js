const crypto = require('crypto');

// Generate a 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hash OTP for safe DB storage
function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

// OTP expiry — 10 minutes from now
function getOtpExpiry() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 10);
  return date;
}

module.exports = { generateOtp, hashOtp, getOtpExpiry };
