const express = require('express');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Friend = require('../models/Friend');
const Team = require('../models/Team');
const Battle = require('../models/Battle');
const { simulateBattle } = require('../utils/battleEngine');
const { sendNotificationToUser } = require('../utils/webpush');

const router = express.Router();
const POKEAPI = process.env.POKEAPI_BASE_URL || 'https://pokeapi.co/api/v2';

router.use(authMiddleware);

// POST /api/battles — start a battle
router.post('/', async (req, res) => {
  try {
    const { opponent_id, challenger_team_id, opponent_team_id } = req.body;

    if (!opponent_id || !challenger_team_id || !opponent_team_id) {
      return res.status(400).json({ error: 'opponent_id, challenger_team_id, and opponent_team_id are required' });
    }

    console.log('⚔️ ========== BATALLA INICIADA ==========');
    console.log('   Retador ID:', req.user.id);
    console.log('   Oponente ID:', opponent_id);
    console.log('   Team retador:', challenger_team_id);
    console.log('   Team oponente:', opponent_team_id);

    // Convertir a ObjectId con validación
    let opponentObjectId, currentUserObjectId, challengerTeamObjectId, opponentTeamObjectId;
    try {
      opponentObjectId = new mongoose.Types.ObjectId(opponent_id);
      currentUserObjectId = new mongoose.Types.ObjectId(req.user.id);
      challengerTeamObjectId = new mongoose.Types.ObjectId(challenger_team_id);
      opponentTeamObjectId = new mongoose.Types.ObjectId(opponent_team_id);
    } catch (err) {
      console.log('   ❌ ID inválido - no es ObjectId válido');
      return res.status(400).json({ error: 'Invalid opponent_id or user_id format' });
    }

    // Verify friendship
    const friendship = await Friend.findOne({
      $or: [
        { user_id: currentUserObjectId, friend_id: opponentObjectId },
        { user_id: opponentObjectId, friend_id: currentUserObjectId }
      ],
      status: 'accepted'
    });

    if (!friendship && req.user.id !== opponent_id) {
      console.log('   ❌ No son amigos');
      return res.status(403).json({ error: 'You can only battle friends' });
    }

    // Verify teams exist and belong to correct users
    const challengerTeam = await Team.findOne({ _id: challengerTeamObjectId, user_id: currentUserObjectId });
    console.log('   Equipo retador encontrado:', !!challengerTeam);

    const opponentTeam = await Team.findOne({ _id: opponentTeamObjectId, user_id: opponentObjectId });
    console.log('   Equipo oponente encontrado:', !!opponentTeam);

    if (!challengerTeam) {
      console.log('   ❌ Equipo retador no encontrado');
      return res.status(404).json({ error: 'Challenger team not found' });
    }

    if (!opponentTeam) {
      console.log('   ❌ Equipo oponente no encontrado');
      console.log('   📍 Buscando con user_id:', opponentObjectId.toString());
      console.log('   📍 Team IDs en BD:', opponent_team_id);
      return res.status(404).json({ error: 'Opponent team not found' });
    }

    // Get team members (sorted by slot implicitly if we sort them here)
    const challengerMembers = challengerTeam.members.sort((a,b) => a.slot - b.slot);
    const opponentMembers = opponentTeam.members.sort((a,b) => a.slot - b.slot);

    if (challengerMembers.length === 0) return res.status(400).json({ error: 'Challenger team has no Pokémon' });
    if (opponentMembers.length === 0) return res.status(400).json({ error: 'Opponent team has no Pokémon' });

    // Fetch Pokémon data from PokeAPI
    const fetchPokemon = async (members) => {
      return Promise.all(members.map(async (m) => {
        const response = await fetch(`${POKEAPI}/pokemon/${m.pokemon_id}`);
        return response.json();
      }));
    };

    const [team1Data, team2Data] = await Promise.all([
      fetchPokemon(challengerMembers),
      fetchPokemon(opponentMembers)
    ]);

    // Simulate battle
    const result = simulateBattle(team1Data, team2Data);

    const winnerId = result.winner === 'challenger' ? currentUserObjectId : opponentObjectId;

    console.log('   ⚔️ Batalla simulada - Ganador:', result.winner);

    // Save battle
    const battleResult = await Battle.create({
      challenger_id: currentUserObjectId,
      opponent_id: opponentObjectId,
      challenger_team_id,
      opponent_team_id,
      winner_id: winnerId,
      log: result.log
    });

    // Send Push Notification asynchronously to the opponent
    sendNotificationToUser(opponent_id.toString(), {
      title: '¡Fuiste retado a una batalla!',
      body: `${req.user.username} te ha desafiado con su equipo "${challengerTeam.name}". ¡Revisa el historial para ver quién ganó!`,
      icon: '/favicon.svg'
    });

    res.status(201).json({
      id: battleResult._id,
      winner: result.winner,
      winner_id: winnerId,
      log: result.log
    });
  } catch (err) {
    console.error('Battle error:', err);
    res.status(500).json({ error: 'Battle simulation failed' });
  }
});

// GET /api/battles — user's battle history
router.get('/', async (req, res) => {
  try {
    const currentUserObjectId = new mongoose.Types.ObjectId(req.user.id);
    
    const battles = await Battle.find({
      $or: [{ challenger_id: currentUserObjectId }, { opponent_id: currentUserObjectId }]
    })
    .sort('-created_at')
    .populate('challenger_id', 'username')
    .populate('opponent_id', 'username')
    .populate('winner_id', 'username')
    .populate('challenger_team_id', 'name')
    .populate('opponent_team_id', 'name');

    const mapped = battles.map(b => ({
      id: b._id,
      challenger_id: b.challenger_id?._id,
      opponent_id: b.opponent_id?._id,
      challenger_team_id: b.challenger_team_id?._id,
      opponent_team_id: b.opponent_team_id?._id,
      winner_id: b.winner_id?._id,
      challenger_name: b.challenger_id?.username || 'Unknown',
      opponent_name: b.opponent_id?.username || 'Unknown',
      winner_name: b.winner_id?.username,
      challenger_team_name: b.challenger_team_id?.name || 'Unknown Team',
      opponent_team_name: b.opponent_team_id?.name || 'Unknown Team',
      created_at: b.created_at
    }));

    res.json({ battles: mapped });
  } catch (err) {
    console.error('Get battles error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/battles/:id — single battle details
router.get('/:id', async (req, res) => {
  try {
    const b = await Battle.findOne({
      _id: req.params.id,
      $or: [{ challenger_id: req.user.id }, { opponent_id: req.user.id }]
    })
    .populate('challenger_id', 'username')
    .populate('opponent_id', 'username')
    .populate('winner_id', 'username')
    .populate('challenger_team_id', 'name')
    .populate('opponent_team_id', 'name');

    if (!b) return res.status(404).json({ error: 'Battle not found' });

    res.json({
      battle: {
        id: b._id,
        challenger_id: b.challenger_id?._id,
        opponent_id: b.opponent_id?._id,
        challenger_team_id: b.challenger_team_id?._id,
        opponent_team_id: b.opponent_team_id?._id,
        winner_id: b.winner_id?._id,
        challenger_name: b.challenger_id?.username || 'Unknown',
        opponent_name: b.opponent_id?.username || 'Unknown',
        winner_name: b.winner_id?.username,
        challenger_team_name: b.challenger_team_id?.name || 'Unknown Team',
        opponent_team_name: b.opponent_team_id?.name || 'Unknown Team',
        log: b.log,
        created_at: b.created_at
      }
    });

  } catch (err) {
    console.error('Get battle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
