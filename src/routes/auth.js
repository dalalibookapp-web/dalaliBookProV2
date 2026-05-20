const express = require('express');
const router = express.Router();
const {
  register,
  verifyOtp,
  resendOtp,
  login,
  refresh,
  logout,
  me,
  forgotPassword,
  showResetForm,
  handleResetPassword,
} = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authMiddleware, me);
router.post('/forgot-password', forgotPassword);
router.get('/reset-password', showResetForm);
router.post('/reset-password', handleResetPassword);

module.exports = router;
