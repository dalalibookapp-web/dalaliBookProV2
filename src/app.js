require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan= require('morgan');
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transaction');
const partyRoutes = require('./routes/party');

//middleware
const authMiddleware = require('./middleware/auth');
const requirePremium = require('./middleware/requirePremium');
const pool = require('./config/db');

const app = express();

// ── Middleware ───────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ── Routes ───────────────────────────────────────────────────────

app.use('/auth', authRoutes);
app.use('/transactions', authMiddleware,requirePremium,transactionRoutes);
app.use('/parties', authMiddleware, requirePremium, partyRoutes);


app.get('/api/bootstrap',authMiddleware,requirePremium, async (req, res) => {
  try {
    const txRes = await pool.query('SELECT * FROM transactions WHERE broker_id = $1 ORDER BY created_at DESC', [req.user.id]);
    const partyRes = await pool.query('SELECT * FROM parties WHERE broker_id = $1', [req.user.id]);

    res.json({
      transactions: txRes.rows || [],
      party: partyRes.rows || [],
    });

  } catch (err) {
    console.error('Bootstrap error:', err);
    res.status(500).json({ error: 'Failed to bootstrap data' });
  }
});

// ── Health Check ─────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 Handler ──────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ─────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ─────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
