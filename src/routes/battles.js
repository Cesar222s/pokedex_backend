const express = require('express');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Friend = require('../models/Friend');
const Team = require('../models/Team');
const Battle = require('../models/Battle');
const { sendNotificationToUser } = require('../utils/webpush');

const router = express.Router();
const POKEAPI = process.env.POKEAPI_BASE_URL || 'https://pokeapi.co/api/v2';

// Utilidad: traer datos de Pokémon desde PokeAPI
const fetchPokemonData = async (pokemonId) => {
  try {
    const response = await fetch(`${POKEAPI}/pokemon/${pokemonId}`);
    return response.json();
  } catch (err) {
    console.error(`Error fetching data for ${pokemonId}:`, err.message);
    return null;
  }
};

// Utilidad: calcular daño básico
const calculateDamage = (attacker, defender, move) => {
  // Simulación simplificada de daño
  const basePower = move.power || 50;
  const attackerAttack = attacker.stats?.find(s => s.stat.name === 'attack')?.base_stat || 75;
  const defenderDefense = defender.stats?.find(s => s.stat.name === 'defense')?.base_stat || 75;
  
  const damage = Math.floor((2 * 50 / 5 + 2) * basePower * (attackerAttack / defenderDefense) / 50 + 2);
  return Math.max(1, Math.floor(damage * (0.85 + Math.random() * 0.3))); // Variabilidad
};

router.use(authMiddleware);

// ===================================
// POST /api/battles — INICIAR BATALLA EN VIVO
// ===================================
router.post('/', async (req, res) => {
  try {
    const { opponent_id, challenger_team_id, opponent_team_id } = req.body;

    if (!opponent_id || !challenger_team_id || !opponent_team_id) {
      return res.status(400).json({ error: 'opponent_id, challenger_team_id, and opponent_team_id are required' });
    }

    console.log('⚔️ ========== BATALLA EN VIVO INICIADA ==========');
    console.log('   Retador ID:', req.user.id);
    console.log('   Oponente ID:', opponent_id);

    let opponentObjectId, currentUserObjectId, challengerTeamObjectId, opponentTeamObjectId;
    try {
      opponentObjectId = new mongoose.Types.ObjectId(opponent_id);
      currentUserObjectId = new mongoose.Types.ObjectId(req.user.id);
      challengerTeamObjectId = new mongoose.Types.ObjectId(challenger_team_id);
      opponentTeamObjectId = new mongoose.Types.ObjectId(opponent_team_id);
    } catch (err) {
      console.log('   ❌ ID inválido');
      return res.status(400).json({ error: 'Invalid IDs format' });
    }

    // Verificar amistad
    const friendship = await Friend.findOne({
      $or: [
        { user_id: currentUserObjectId, friend_id: opponentObjectId },
        { user_id: opponentObjectId, friend_id: currentUserObjectId }
      ],
      status: 'accepted'
    });

    if (!friendship && currentUserObjectId.toString() !== opponentObjectId.toString()) {
      return res.status(403).json({ error: 'You can only battle friends' });
    }

    // Verificar equipos
    const challengerTeam = await Team.findOne({ _id: challengerTeamObjectId, user_id: currentUserObjectId });
    const opponentTeam = await Team.findOne({ _id: opponentTeamObjectId, user_id: opponentObjectId });

    if (!challengerTeam || !opponentTeam) {
      return res.status(404).json({ error: 'One or both teams not found' });
    }

    if (challengerTeam.members.length === 0 || opponentTeam.members.length === 0) {
      return res.status(400).json({ error: 'Teams must have at least one Pokémon' });
    }

    // Obtener datos del primer Pokémon de cada equipo de PokeAPI
    const firstChallengerMember = challengerTeam.members.sort((a, b) => a.slot - b.slot)[0];
    const firstOpponentMember = opponentTeam.members.sort((a, b) => a.slot - b.slot)[0];

    const challengerPokemonData = await fetchPokemonData(firstChallengerMember.pokemon_id);
    const opponentPokemonData = await fetchPokemonData(firstOpponentMember.pokemon_id);

    if (!challengerPokemonData || !opponentPokemonData) {
      return res.status(500).json({ error: 'Failed to fetch Pokémon data' });
    }

    // Crear documento de batalla
    const battleData = {
      challenger_id: currentUserObjectId,
      opponent_id: opponentObjectId,
      challenger_team_id: challengerTeamObjectId,
      opponent_team_id: opponentTeamObjectId,
      status: 'waiting_for_opponent',
      current_turn: 1,
      current_player_id: currentUserObjectId,
      challenger_active_pokemon: {
        pokemon_id: firstChallengerMember.pokemon_id,
        pokemon_name: challengerPokemonData.name,
        hp: challengerPokemonData.stats.find(s => s.stat.name === 'hp').base_stat,
        max_hp: challengerPokemonData.stats.find(s => s.stat.name === 'hp').base_stat,
        status: 'normal'
      },
      opponent_active_pokemon: {
        pokemon_id: firstOpponentMember.pokemon_id,
        pokemon_name: opponentPokemonData.name,
        hp: opponentPokemonData.stats.find(s => s.stat.name === 'hp').base_stat,
        max_hp: opponentPokemonData.stats.find(s => s.stat.name === 'hp').base_stat,
        status: 'normal'
      }
    };

    const battle = await Battle.create(battleData);

    console.log('   ✅ Batalla creada:', battle._id);

    // Notificar al oponente
    sendNotificationToUser(opponentObjectId.toString(), {
      title: '¡Fuiste retado a una batalla!',
      body: `${req.user.username} te desafía con su equipo "${challengerTeam.name}". ¡Acepta el reto!`,
      icon: '/favicon.svg',
      data: { url: `/battle/${battle._id}` }
    });

    res.status(201).json({
      battle_id: battle._id,
      status: 'waiting_for_opponent',
      message: 'Battle created. Waiting for opponent to join.'
    });
  } catch (err) {
    console.error('Battle creation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================================
// GET /api/battles/:id/status — OBTENER ESTADO ACTUAL
// ===================================
router.get('/:id/status', async (req, res) => {
  try {
    const currentUserObjectId = new mongoose.Types.ObjectId(req.user.id);
    const battleId = new mongoose.Types.ObjectId(req.params.id);

    const battle = await Battle.findOne({
      _id: battleId,
      $or: [{ challenger_id: currentUserObjectId }, { opponent_id: currentUserObjectId }]
    })
    .populate('challenger_id', 'username')
    .populate('opponent_id', 'username')
    .populate('challenger_team_id', 'name members')
    .populate('opponent_team_id', 'name members');

    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    // Determinar si es retador u oponente
    const isChallenger = currentUserObjectId.toString() === battle.challenger_id._id.toString();

    res.json({
      battle_id: battle._id,
      status: battle.status,
      turn: battle.current_turn,
      is_your_turn: battle.current_player_id.toString() === currentUserObjectId.toString(),
      you_are: isChallenger ? 'challenger' : 'opponent',
      
      your_pokemon: isChallenger ? battle.challenger_active_pokemon : battle.opponent_active_pokemon,
      opponent_pokemon: isChallenger ? battle.opponent_active_pokemon : battle.challenger_active_pokemon,
      
      your_team: isChallenger ? battle.challenger_team_id : battle.opponent_team_id,
      opponent_team: isChallenger ? battle.opponent_team_id : battle.challenger_team_id,
      
      your_pokemon_slot: isChallenger ? battle.challenger_active_slot : battle.opponent_active_slot,
      opponent_pokemon_slot: isChallenger ? battle.opponent_active_slot : battle.challenger_active_slot,
      
      winner_id: battle.winner_id,
      finish_reason: battle.finish_reason,
      turn_log: battle.turn_log,
      
      challenger_name: battle.challenger_id.username,
      opponent_name: battle.opponent_id.username
    });
  } catch (err) {
    console.error('Get battle status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================================
// POST /api/battles/:id/action — EJECUTAR ATAQUE
// ===================================
router.post('/:id/action', async (req, res) => {
  try {
    const currentUserObjectId = new mongoose.Types.ObjectId(req.user.id);
    const battleId = new mongoose.Types.ObjectId(req.params.id);
    const { move_index } = req.body;

    if (move_index === undefined) {
      return res.status(400).json({ error: 'move_index is required' });
    }

    const battle = await Battle.findById(battleId);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }

    // Verificar que es turno del usuario
    if (battle.current_player_id.toString() !== currentUserObjectId.toString()) {
      return res.status(403).json({ error: 'It\'s not your turn' });
    }

    // Verificar que el usuario está en la batalla
    const isChallenger = battle.challenger_id.toString() === currentUserObjectId.toString();
    const isOpponent = battle.opponent_id.toString() === currentUserObjectId.toString();

    if (!isChallenger && !isOpponent) {
      return res.status(403).json({ error: 'You are not part of this battle' });
    }

    console.log(`⚔️  Turno ${battle.current_turn} - Acción de ${isChallenger ? 'Retador' : 'Oponente'}`);

    // Cambiar estado a "active" en el primer movimiento
    if (battle.status === 'waiting_for_opponent') {
      battle.status = 'active';
    }

    // Obtener el Pokémon del atacante y defensor
    const attacker = isChallenger ? battle.challenger_active_pokemon : battle.opponent_active_pokemon;
    const defender = isChallenger ? battle.opponent_active_pokemon : battle.challenger_active_pokemon;

    // Obtener datos de Pokémon de PokeAPI para obtener movimientos
    const attackerData = await fetchPokemonData(attacker.pokemon_id);
    if (!attackerData || !attackerData.moves || !attackerData.moves[move_index]) {
      return res.status(400).json({ error: 'Invalid move index' });
    }

    const moveData = attackerData.moves[move_index];
    const moveUrl = moveData.move.url;
    const moveResponse = await fetch(moveUrl);
    const moveDetails = await moveResponse.json();

    // Calcular daño
    const damage = calculateDamage(attackerData, { stats: [] }, moveDetails);
    defender.hp = Math.max(0, defender.hp - damage);

    // Registrar acción
    battle.turn_log.push({
      turn_number: battle.current_turn,
      player_id: currentUserObjectId,
      action_type: 'move',
      move_name: moveDetails.name,
      damage_dealt: damage
    });

    console.log(`   Movimiento: ${moveDetails.name}, Daño: ${damage}, HP Oponente: ${defender.hp}/${defender.max_hp}`);

    // Verificar si el defensor se desmayó
    if (defender.hp === 0) {
      defender.status = 'fainted';
      console.log(`   ¡${defender.pokemon_name} se desmayó!`);

      // Contar Pokémon desmayados
      const faintedCount = battle.turn_log.filter(log => log.action_type === 'fainted').length + 1;
      const defenderTeamSize = isChallenger 
        ? (await Team.findById(battle.opponent_team_id)).members.length
        : (await Team.findById(battle.challenger_team_id)).members.length;

      if (faintedCount >= defenderTeamSize) {
        // ¡Batalla terminada!
        battle.status = 'finished';
        battle.winner_id = currentUserObjectId;
        battle.finish_reason = 'all_pokemon_fainted';
        battle.finished_at = Date.now();

        console.log(`   ✅ ¡Batalla terminada! Ganador: ${isChallenger ? 'Retador' : 'Oponente'}`);

        await battle.save();

        return res.json({
          status: 'finished',
          winner_id: battle.winner_id,
          message: 'Battle finished! All opponent Pokémon fainted.'
        });
      }

      // Preparar siguiente Pokémon
      battle.turn_log.push({
        turn_number: battle.current_turn,
        player_id: isChallenger ? battle.opponent_id : battle.challenger_id,
        action_type: 'fainted',
        move_name: defender.pokemon_name
      });
    }

    // Cambiar turno al otro jugador
    battle.current_turn += 1;
    battle.current_player_id = isChallenger ? battle.opponent_id : battle.challenger_id;

    await battle.save();

    res.json({
      status: battle.status,
      turn: battle.current_turn,
      move_name: moveDetails.name,
      damage_dealt: damage,
      opponent_hp: defender.hp,
      opponent_max_hp: defender.max_hp,
      opponent_status: defender.status,
      message: `${moveDetails.name} dealt ${damage} damage!`
    });
  } catch (err) {
    console.error('Battle action error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================================
// GET /api/battles — HISTORIAL DE BATALLAS
// ===================================
router.get('/', async (req, res) => {
  try {
    const currentUserObjectId = new mongoose.Types.ObjectId(req.user.id);

    const battles = await Battle.find({
      $or: [{ challenger_id: currentUserObjectId }, { opponent_id: currentUserObjectId }]
    })
    .sort('-created_at')
    .limit(20)
    .populate('challenger_id', 'username')
    .populate('opponent_id', 'username')
    .populate('winner_id', 'username');

    const mapped = battles.map(b => ({
      id: b._id,
      challenger_name: b.challenger_id?.username,
      opponent_name: b.opponent_id?.username,
      winner_name: b.winner_id?.username,
      status: b.status,
      finish_reason: b.finish_reason,
      created_at: b.created_at
    }));

    res.json({ battles: mapped });
  } catch (err) {
    console.error('Get battles error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
