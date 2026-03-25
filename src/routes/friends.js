const express = require('express');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Friend = require('../models/Friend');
const User = require('../models/User');
const { sendNotificationToUser } = require('../utils/webpush');

const router = express.Router();
router.use(authMiddleware);

// POST /api/friends/add
router.post('/add', async (req, res) => {
  try {
    const { friend_code } = req.body;
    if (!friend_code) return res.status(400).json({ error: 'friend_code is required' });

    console.log(`📥 Friend add request received`);
    console.log(`   Current user ID: ${req.user.id} (type: ${typeof req.user.id})`);
    console.log(`   Current user email: ${req.user.email}`);
    console.log(`   Friend code provided: ${friend_code}`);

    // Normalize friend_code: trim spaces and convert to uppercase for matching (case-insensitive search)
    const normalizedCode = friend_code.trim().toUpperCase();
    console.log(`   Normalized code: ${normalizedCode}`);
    
    const friend = await User.findOne({ friend_code: { $regex: `^${normalizedCode}$`, $options: 'i' } }).select('_id username friend_code email');
    if (!friend) {
      console.error(`❌ Friend not found with code: "${normalizedCode}" (original: "${friend_code}")`);
      return res.status(404).json({ error: 'User not found with that code' });
    }

    console.log(`✅ Friend found: ${friend.username} (ID: ${friend._id})`);

    // Convert req.user.id to ObjectId if it's a string
    const currentUserId = mongoose.Types.ObjectId.isValid(req.user.id) 
      ? req.user.id 
      : new mongoose.Types.ObjectId(req.user.id);

    if (friend._id.toString() === currentUserId.toString()) {
      console.warn(`⚠️  Cannot add self as friend`);
      return res.status(400).json({ error: 'You cannot add yourself as a friend' });
    }

    console.log(`   Checking for existing friendship...`);
    const existing = await Friend.findOne({
      $or: [
        { user_id: currentUserId, friend_id: friend._id },
        { user_id: friend._id, friend_id: currentUserId }
      ]
    });

    if (existing) {
      console.log(`   Existing friendship found (status: ${existing.status})`);
      if (existing.status === 'accepted') {
        return res.status(409).json({ error: 'Ya son amigos' });
      }
      
      // Si la solicitud la envió la otra persona, la aceptamos automáticamente
      if (existing.friend_id.toString() === currentUserId.toString()) {
        console.log(`✅ Auto-accepting reverse friend request`);
        existing.status = 'accepted';
        await existing.save();
        return res.status(200).json({ message: '¡Solicitud aceptada automáticamente!', friend: { id: friend._id, username: friend.username } });
      }

      // Si la enviaste tú, simplemente está pendiente
      console.log(`⚠️  Pending request already exists`);
      return res.status(409).json({ error: 'Ya enviaste una solicitud a este usuario (está pendiente)' });
    }

    console.log(`   Creating new friend request...`);
    const newFriend = await Friend.create({ 
      user_id: currentUserId, 
      friend_id: friend._id, 
      status: 'pending' 
    });
    console.log(`✅ Friend request created with ID: ${newFriend._id}`);
    
    // Send Push Notification asynchronously
    console.log(`   Sending push notification to friend...`);
    sendNotificationToUser(friend._id.toString(), {
      title: '¡Nueva solicitud de amistad!',
      body: `${req.user.username} quiere ser tu amigo en Pokédex.`,
      icon: '/favicon.svg',
      data: { url: '/amigos' }  // Abre la página de amigos directamente
    });

    console.log(`✅ Friend request sent successfully to ${friend.username}`);
    res.status(201).json({ message: 'Friend request sent', friend: { id: friend._id, username: friend.username } });
  } catch (err) {
    console.error('❌ Add friend error:', err.message);
    console.error('   Stack:', err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends
router.get('/', async (req, res) => {
  try {
    console.log(`\n📋 ========== FETCHING FRIENDS ==========`);
    console.log(`   Current user ID: ${req.user.id}`);

    // Convert req.user.id to ObjectId for proper comparison
    const currentUserId = mongoose.Types.ObjectId.isValid(req.user.id) 
      ? new mongoose.Types.ObjectId(req.user.id)
      : req.user.id;

    const friends = await Friend.find({
      $or: [
        { user_id: currentUserId },
        { friend_id: currentUserId }
      ],
      status: 'accepted'
    }).populate('user_id', 'username friend_code').populate('friend_id', 'username friend_code');

    console.log(`   Found ${friends.length} accepted friend(s)`);

    const mapped = friends.map(f => {
      const isSender = f.user_id._id.toString() === currentUserId.toString();
      const friendUser = isSender ? f.friend_id : f.user_id;
      console.log(`   - Friend: ${friendUser.username} (ID: ${friendUser._id})`);
      return {
        id: friendUser._id,
        friendship_id: f._id,
        username: friendUser.username,
        friend_code: friendUser.friend_code
      };
    });

    console.log(`✅ Returning ${mapped.length} friends to user`);
    console.log(`📋 ===================================\n`);
    res.json({ friends: mapped });
  } catch (err) {
    console.error('❌ Get friends error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/pending
router.get('/pending', async (req, res) => {
  try {
    console.log(`\n⏳ ========== FETCHING PENDING REQUESTS ==========`);
    console.log(`   Current user ID: ${req.user.id}`);

    // Convert req.user.id to ObjectId for proper comparison
    const currentUserId = mongoose.Types.ObjectId.isValid(req.user.id) 
      ? new mongoose.Types.ObjectId(req.user.id)
      : req.user.id;

    const pending = await Friend.find({ 
      friend_id: currentUserId, 
      status: 'pending' 
    }).populate('user_id', 'username friend_code');

    console.log(`   Found ${pending.length} pending request(s)`);

    const mapped = pending.map(f => {
      console.log(`   - From: ${f.user_id.username} (ID: ${f.user_id._id})`);
      return {
        id: f._id,
        username: f.user_id.username,
        friend_code: f.user_id.friend_code,
        created_at: f.created_at
      };
    });

    console.log(`✅ Returning ${mapped.length} pending requests`);
    console.log(`⏳ =======================================\n`);
    res.json({ pending: mapped });
  } catch (err) {
    console.error('❌ Get pending error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/friends/:id/accept
router.post('/:id/accept', async (req, res) => {
  try {
    const request = await Friend.findOneAndUpdate(
      { _id: req.params.id, friend_id: req.user.id, status: 'pending' },
      { status: 'accepted' }
    );

    if (!request) return res.status(404).json({ error: 'Friend request not found' });
    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    console.error('Accept friend error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/friends/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await Friend.findOneAndDelete({ 
      _id: req.params.id, 
      $or: [{ user_id: req.user.id }, { friend_id: req.user.id }] 
    });

    if (!result) return res.status(404).json({ error: 'Friendship not found' });
    res.json({ message: 'Friend removed' });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
