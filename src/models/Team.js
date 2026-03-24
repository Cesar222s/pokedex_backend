const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
  pokemon_id: { type: Number, required: true },
  slot: { type: Number, required: true, min: 1, max: 6 }
}, { _id: false });

const teamSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  members: [teamMemberSchema],
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Team', teamSchema);
