require('dotenv').config();

// ==========================================
// POKÉDEX PRO - FULL STACK PWA & BATTLE SYSTEM
// Features: App Shell, Dynamic Cache, Offline Sync (IndexedDB),
// Push Notifications, Live Turn-based Battles.
// ==========================================
const express = require('express');
const cors = require('cors');
const path = require('path');

// Force redeploy - v2
const authRoutes = require('./routes/auth');
const pokemonRoutes = require('./routes/pokemon');
const favoritesRoutes = require('./routes/favorites');
const teamsRoutes = require('./routes/teams');
const friendsRoutes = require('./routes/friends');
const battlesRoutes = require('./routes/battles');
const notificationsRoutes = require('./routes/notifications');
const connectDB = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Conectar a MongoDB
connectDB();

// Middlewares
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173'
  ],
  credentials: true
}));

app.use(express.json());

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/pokemon', pokemonRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/battles', battlesRoutes);
app.use('/api/notifications', notificationsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Servir frontend (si existe carpeta public)
app.use(express.static(path.join(__dirname, '../public')));

// ⚠️ IMPORTANTE: Para que Vue (Single Page Application) funcione en Express 5.x
// Dado que Express 5 ya no usa '*' para comodines absolutos en path-to-regexp v8,
// la mejor práctica es usar un app.use() al final de las rutas para devolver el index.html.
app.use((req, res) => {
  // Evitamos responder con JSON o 404 para que la PWA y Vue Router tomen el control.
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Manejo de errores (si algo falla en el servidor)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal server error'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Pokédex BFF server running on http://localhost:${PORT}`);
});