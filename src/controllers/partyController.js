const pool = require("../config/db");

async function addParty(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let { payload } = req.body;

    if(!payload) {
      payload = "empty"
    }

    

    const result = await pool.query(
      `INSERT INTO parties (broker_id, payload)
       VALUES ($1, $2)
       ON CONFLICT (broker_id)
       DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()
       RETURNING id, payload, updated_at`,
      [req.user.id, payload]
    );

    res.status(200).json({
      message: "Party saved successfully",
      party: result.rows[0],
    });

  } catch (error) {
    console.error("Error in addParty:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { addParty };