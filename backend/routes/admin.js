const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const {
  getOverview,
  listPlayers,
  updatePlayerRole,
  closeTable
} = require('../controllers/adminController');

const router = express.Router();

router.use(requireAdmin);
router.get('/overview', getOverview);
router.get('/players', listPlayers);
router.patch('/players/:playerId/role', updatePlayerRole);
router.delete('/tables/:tableId', closeTable);

module.exports = router;
