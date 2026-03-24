const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pokemon_id: { type: Number, required: true }, // PokéAPI ID
  created_at: { type: Date, default: Date.now }
});

favoriteSchema.index({ user_id: 1, pokemon_id: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);
