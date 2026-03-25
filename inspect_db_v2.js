const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./src/models/User');
const Team = require('./src/models/Team');

dotenv.config();

async function inspect() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const users = await User.find({ username: { $in: [/Ienuddub/i, /NDCUDSNU/i, /Cesar2004/i] } });
    console.log('👤 Users found:', users.length);
    users.forEach(u => console.log(`- ${u.username}: ${u._id}`));

    const teams = await Team.find({});
    console.log('🛡️ Total Teams:', teams.length);
    teams.forEach(t => {
      console.log(`- Team: ${t.name}, ID: ${t._id}, User: ${t.user_id}`);
      console.log(`  Members: ${JSON.stringify(t.members)}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

inspect();
