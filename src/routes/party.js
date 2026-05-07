const express = require('express');
const router = express.Router();
const { addParty } = require('../controllers/partyController');

router.post('/add', addParty);

module.exports = router;
