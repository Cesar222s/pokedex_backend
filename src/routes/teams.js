const express = require('express');
const authMiddleware = require('../middleware/auth');
const Team = require('../models/Team');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const teams = await Team.find({ user_id: req.user.id }).sort('-created_at');
    const mapped = teams.map(t => ({
      id: t._id,
      user_id: t.user_id,
      name: t.name,
      members: t.members,
      created_at: t.created_at
    }));
    res.json({ teams: mapped });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Team name is required' });

    const team = await Team.create({ user_id: req.user.id, name, members: [] });
    res.status(201).json({ id: team._id, name, members: [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const team = await Team.findOneAndUpdate({ _id: req.params.id, user_id: req.user.id }, { name: req.body.name });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json({ message: 'Team updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await Team.deleteOne({ _id: req.params.id, user_id: req.user.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Team not found' });
    res.json({ message: 'Team deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/members', async (req, res) => {
  try {
    const team = await Team.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.members.length >= 6) return res.status(400).json({ error: 'Team is full (max 6 Pokémon)' });

    const usedSlots = new Set(team.members.map(m => m.slot));
    let slot = 1;
    while (usedSlots.has(slot)) slot++;

    team.members.push({ pokemon_id: req.body.pokemon_id, slot });
    await team.save();

    res.status(201).json({ id: null, pokemon_id: req.body.pokemon_id, slot });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/members/:pokemonId', async (req, res) => {
  try {
    const team = await Team.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const initialLength = team.members.length;
    team.members = team.members.filter(m => m.pokemon_id !== parseInt(req.params.pokemonId));
    
    if (team.members.length === initialLength) return res.status(404).json({ error: 'Member not found' });
    
    await team.save();
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
