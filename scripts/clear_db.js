const mongoose = require('mongoose');
require('dotenv').config();

async function clearDB() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env');
    process.exit(1);
  }

  try {
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected.');

    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      console.log(`🗑️  Clearing collection: ${collection.name}`);
      await mongoose.connection.db.collection(collection.name).deleteMany({});
    }

    console.log('✨ Database cleared successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error clearing database:', err.message);
    process.exit(1);
  }
}

clearDB();
