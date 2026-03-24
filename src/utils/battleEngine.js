const { getEffectiveness } = require('./typeChart');

/**
 * Simulates a turn-based 6v6 Pokémon battle.
 * @param {Array} team1 - Array of Pokémon data objects (from PokeAPI) for challenger
 * @param {Array} team2 - Array of Pokémon data objects for opponent
 * @returns {{ winner: 'challenger'|'opponent', log: Array }}
 */
function simulateBattle(team1, team2) {
  const log = [];

  // Prepare combatants with HP and stats
  const preparePokemon = (pokemon) => {
    const stats = {};
    pokemon.stats.forEach(s => {
      stats[s.stat.name] = s.base_stat;
    });
    return {
      name: pokemon.name,
      id: pokemon.id,
      types: pokemon.types.map(t => t.type?.name || t.name),
      hp: stats.hp || 50,
      maxHp: stats.hp || 50,
      attack: stats.attack || 50,
      defense: stats.defense || 50,
      'special-attack': stats['special-attack'] || 50,
      'special-defense': stats['special-defense'] || 50,
      speed: stats.speed || 50,
      moves: pokemon.moves ? pokemon.moves.slice(0, 4).map(m => m.move?.name || m) : ['tackle']
    };
  };

  const fighters1 = team1.map(preparePokemon);
  const fighters2 = team2.map(preparePokemon);

  let idx1 = 0;
  let idx2 = 0;
  let turnCount = 0;
  const MAX_TURNS = 200;

  log.push({
    type: 'battle_start',
    message: `Battle begins! Team 1 sends out ${fighters1[0].name}. Team 2 sends out ${fighters2[0].name}.`
  });

  while (idx1 < fighters1.length && idx2 < fighters2.length && turnCount < MAX_TURNS) {
    const poke1 = fighters1[idx1];
    const poke2 = fighters2[idx2];
    turnCount++;

    // Determine who goes first by speed (random tiebreak)
    const first = poke1.speed >= poke2.speed ? { attacker: poke1, defender: poke2, side: 'challenger' } :
      { attacker: poke2, defender: poke1, side: 'opponent' };
    const second = first.attacker === poke1 ? { attacker: poke2, defender: poke1, side: 'opponent' } :
      { attacker: poke1, defender: poke2, side: 'challenger' };

    // First attack
    const dmg1 = calculateDamage(first.attacker, first.defender);
    first.defender.hp = Math.max(0, first.defender.hp - dmg1.damage);

    log.push({
      type: 'attack',
      turn: turnCount,
      attacker: first.attacker.name,
      defender: first.defender.name,
      move: dmg1.move,
      damage: dmg1.damage,
      effectiveness: dmg1.effectiveness,
      defenderHp: first.defender.hp,
      defenderMaxHp: first.defender.maxHp,
      side: first.side
    });

    // Check if defender fainted
    if (first.defender.hp <= 0) {
      log.push({
        type: 'faint',
        pokemon: first.defender.name,
        side: first.side === 'challenger' ? 'opponent' : 'challenger'
      });

      if (first.side === 'challenger') {
        idx2++;
        if (idx2 < fighters2.length) {
          log.push({ type: 'switch', pokemon: fighters2[idx2].name, side: 'opponent' });
        }
      } else {
        idx1++;
        if (idx1 < fighters1.length) {
          log.push({ type: 'switch', pokemon: fighters1[idx1].name, side: 'challenger' });
        }
      }
      continue;
    }

    // Second attack
    const dmg2 = calculateDamage(second.attacker, second.defender);
    second.defender.hp = Math.max(0, second.defender.hp - dmg2.damage);

    log.push({
      type: 'attack',
      turn: turnCount,
      attacker: second.attacker.name,
      defender: second.defender.name,
      move: dmg2.move,
      damage: dmg2.damage,
      effectiveness: dmg2.effectiveness,
      defenderHp: second.defender.hp,
      defenderMaxHp: second.defender.maxHp,
      side: second.side
    });

    if (second.defender.hp <= 0) {
      log.push({
        type: 'faint',
        pokemon: second.defender.name,
        side: second.side === 'challenger' ? 'opponent' : 'challenger'
      });

      if (second.side === 'challenger') {
        idx2++;
        if (idx2 < fighters2.length) {
          log.push({ type: 'switch', pokemon: fighters2[idx2].name, side: 'opponent' });
        }
      } else {
        idx1++;
        if (idx1 < fighters1.length) {
          log.push({ type: 'switch', pokemon: fighters1[idx1].name, side: 'challenger' });
        }
      }
    }
  }

  const winner = idx2 >= fighters2.length ? 'challenger' : 'opponent';
  log.push({
    type: 'battle_end',
    winner,
    message: `${winner === 'challenger' ? 'Team 1' : 'Team 2'} wins the battle!`
  });

  return { winner, log };
}

function calculateDamage(attacker, defender) {
  // Pick a random move
  const move = attacker.moves[Math.floor(Math.random() * attacker.moves.length)];

  // Determine attack type based on attacker's primary type
  const attackType = attacker.types[0] || 'normal';

  // Type effectiveness
  const effectiveness = getEffectiveness(attackType, defender.types);

  // STAB bonus (Same-Type Attack Bonus)
  const stab = attacker.types.includes(attackType) ? 1.5 : 1;

  // Damage formula (simplified version of official formula)
  const level = 50;
  const power = 60 + Math.floor(Math.random() * 30); // power varies 60-89
  const attack = attacker.attack;
  const defense = defender.defense;

  // Random factor (0.85 to 1.0)
  const random = 0.85 + Math.random() * 0.15;

  let damage = Math.floor(
    ((((2 * level / 5 + 2) * power * attack / defense) / 50) + 2) * stab * effectiveness * random
  );

  // Minimum 1 damage (unless immune)
  if (effectiveness === 0) {
    damage = 0;
  } else if (damage < 1) {
    damage = 1;
  }

  let effectivenessLabel = 'neutral';
  if (effectiveness > 1) effectivenessLabel = 'super_effective';
  else if (effectiveness === 0) effectivenessLabel = 'immune';
  else if (effectiveness < 1) effectivenessLabel = 'not_effective';

  return { damage, move, effectiveness: effectivenessLabel };
}

module.exports = { simulateBattle };
