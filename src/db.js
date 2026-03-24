const mongoose = require('mongoose');

// Models
require('./models/User');
require('./models/Favorite');
require('./models/Team');
require('./models/Friend');
require('./models/Battle');
require('./models/Subscription');

async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI no está configurado en .env");
    
    await mongoose.connect(uri);
    console.log('✅ Conectado a MongoDB Atlas exitosamente');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB Atlas:', err);
    process.exit(1);
  }
}

module.exports = connectDB;
