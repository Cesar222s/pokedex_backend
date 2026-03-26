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

function normalizeOrigin(value) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    // Normalize protocol/host/port and remove trailing slash differences.
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

const localOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173'
];

const envOrigins = [
  ...(process.env.CORS_ORIGINS || '').split(','),
  ...(process.env.FRONTEND_URL || '').split(',')
]
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const allowedOrigins = [...new Set([
  ...localOrigins.map((origin) => normalizeOrigin(origin)),
  ...envOrigins
])];

// Conectar a MongoDB
connectDB();

// Middlewares
app.use(cors({
  origin: (origin, callback) => {
    const normalizedOrigin = normalizeOrigin(origin);

    // Allow non-browser calls (curl, health checks) and configured browser origins.
    if (!origin || (normalizedOrigin && allowedOrigins.includes(normalizedOrigin))) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
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

// Respuesta consistente para rutas API no existentes.
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API route not found',
    path: req.originalUrl
  });
});

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