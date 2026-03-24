const express = require('express');
const authMiddleware = require('../middleware/auth');
const Favorite = require('../models/Favorite');

const router = express.Router();
router.use(authMiddleware);

// GET /api/favorites
router.get('/', async (req, res) => {
  try {
    const favorites = await Favorite.find({ user_id: req.user.id }).sort('-created_at');
    const mapped = favorites.map(f => ({
      id: f._id,
      user_id: f.user_id,
      pokemon_id: f.pokemon_id,
      created_at: f.created_at
    }));
    res.json({ favorites: mapped });
  } catch (err) {
    console.error('Get favorites error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/favorites
router.post('/', async (req, res) => {
  try {
    const { pokemon_id } = req.body;
    if (!pokemon_id) return res.status(400).json({ error: 'pokemon_id is required' });

    const existing = await Favorite.findOne({ user_id: req.user.id, pokemon_id });
    if (existing) return res.status(409).json({ error: 'Already in favorites' });

    const fav = await Favorite.create({ user_id: req.user.id, pokemon_id });
    res.status(201).json({ id: fav._id, pokemon_id });
  } catch (err) {
    console.error('Add favorite error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/favorites/:pokemonId
router.delete('/:pokemonId', async (req, res) => {
  try {
    const result = await Favorite.deleteOne({ user_id: req.user.id, pokemon_id: parseInt(req.params.pokemonId) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Favorite not found' });
    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    console.error('Remove favorite error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
