const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Team = require('./src/models/Team');

dotenv.config();

async function inspect() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const ienuddub = await User.findOne({ username: /Ienuddub/i });
    console.log('👤 Opponent (Ienuddub):', ienuddub ? ienuddub._id : '❌ Not found');

    const teams = await Team.find({ name: { $in: [/Jebjsjdd/i, /NDCUDSNU/i] } });
    console.log('🛡️ Teams found:', teams.length);
    teams.forEach(t => {
      console.log(`- Team: ${t.name}, ID: ${t._id}, User: ${t.user_id}, Members: ${t.members.length}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

inspect();
