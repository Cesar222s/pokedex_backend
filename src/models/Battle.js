const mongoose = require('mongoose');

const battleSchema = new mongoose.Schema({
  challenger_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  opponent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  challenger_team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  opponent_team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  winner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  log: { type: Array, default: [] },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Battle', battleSchema);
