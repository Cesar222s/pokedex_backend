const express = require('express');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Team = require('../models/Team');
const Friend = require('../models/Friend');

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

// GET /api/teams/friend/:friend_id - obtener equipos de un amigo
router.get('/friend/:friend_id', async (req, res) => {
  try {
    const { friend_id } = req.params;
    const currentUserId = new mongoose.Types.ObjectId(req.user.id);
    const friendObjectId = new mongoose.Types.ObjectId(friend_id);

    console.log('📋 ========== FETCHING FRIEND TEAMS ==========');
    console.log('   Current user ID:', currentUserId.toString());
    console.log('   Friend ID:', friendObjectId.toString());

    // Verificar que sean amigos
    const friendship = await Friend.findOne({
      $or: [
        { user_id: currentUserId, friend_id: friendObjectId },
        { user_id: friendObjectId, friend_id: currentUserId }
      ],
      status: 'accepted'
    });

    if (!friendship) {
      console.log('   ❌ No son amigos');
      return res.status(403).json({ error: 'Puedes ver equipos solo de amigos aceptados' });
    }

    // Obtener los equipos del amigo
    const teams = await Team.find({ user_id: friendObjectId }).sort('-created_at');
    console.log('   Encontrados', teams.length, 'equipos');

    const mapped = teams.map(t => ({
      id: t._id,
      user_id: t.user_id,
      name: t.name,
      members: t.members,
      created_at: t.created_at
    }));

    console.log('   ✅ Equipos retornados exitosamente');
    console.log('📋 ====================================\n');

    res.json({ teams: mapped });
  } catch (err) {
    console.error('   ❌ Error:', err.message);
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
