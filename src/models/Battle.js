const mongoose = require('mongoose');

const pokemonStateSchema = new mongoose.Schema({
  pokemon_id: String,  // ID del Pokémon en el slot
  pokemon_name: String,
  hp: Number,
  max_hp: Number,
  status: { type: String, default: 'normal' }  // 'normal', 'poisoned', 'burned', 'fainted'
}, { _id: false });

const turnActionSchema = new mongoose.Schema({
  turn_number: Number,
  player_id: mongoose.Schema.Types.ObjectId,  // Quién hizo la acción
  action_type: String,  // 'move', 'switch', 'item'
  move_name: String,
  damage_dealt: Number,
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const battleSchema = new mongoose.Schema({
  // Jugadores y equipos
  challenger_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  opponent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  challenger_team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  opponent_team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  
  // Estado de batalla en vivo
  status: { 
    type: String, 
    enum: ['active', 'finished', 'waiting_for_opponent'],
    default: 'waiting_for_opponent'
  },
  
  // Turno actual
  current_turn: { type: Number, default: 1 },
  current_player_id: { type: mongoose.Schema.Types.ObjectId },  // Quién debe jugar ahora
  
  // Estado de Pokémon activos
  challenger_active_pokemon: pokemonStateSchema,
  opponent_active_pokemon: pokemonStateSchema,
  
  // Índices del Pokémon activo en el equipo
  challenger_active_slot: { type: Number, default: 0 },
  opponent_active_slot: { type: Number, default: 0 },
  
  // Historial de acciones (turnos)
  turn_log: [turnActionSchema],
  
  // Resultado final
  winner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  finish_reason: String,  // 'all_pokemon_fainted', 'surrender', etc
  
  // Timestamps
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  finished_at: Date
});

// Actualizar updated_at antes de guardar
battleSchema.pre('save', function() {
  this.updated_at = Date.now();
});

module.exports = mongoose.model('Battle', battleSchema);
