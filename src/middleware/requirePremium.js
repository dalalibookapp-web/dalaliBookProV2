// middleware/requirePremium.js

const pool = require("../config/db");

function requirePremium(req, res, next) {
  // attach this after authMiddleware on any premium-only route
  // req.user is already set by authMiddleware
  // but we need account_type from DB so fetch it
  

  pool.query(
    'SELECT account_type, premium_expires_at FROM users WHERE id = $1',
    [req.user.id]
  ).then(result => {
    const user = result.rows[0];

   
 
    if (!user || user.account_type !== 'premium' || new Date(user.premium_expires_at) < new Date()) {
      return res.status(403).json({ error: 'This feature requires a premium account' });
    }

     req.account_type = user.account_type
    req.premium_expires_at = user.premium_expires_at
    next();
  }).catch(err => {
    return res.status(500).json({ error: 'Internal server error' });
  });
}

module.exports = requirePremium;