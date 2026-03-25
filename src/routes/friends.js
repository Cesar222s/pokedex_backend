const express = require('express');
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

    const friend = await User.findOne({ friend_code }).select('username friend_code');
    if (!friend) return res.status(404).json({ error: 'User not found with that code' });

    if (friend._id.toString() === req.user.id) {
      return res.status(400).json({ error: 'You cannot add yourself as a friend' });
    }

    const existing = await Friend.findOne({
      $or: [
        { user_id: req.user.id, friend_id: friend._id },
        { user_id: friend._id, friend_id: req.user.id }
      ]
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(409).json({ error: 'Ya son amigos' });
      }
      
      // Si la solicitud la envió la otra persona, la aceptamos automáticamente
      if (existing.friend_id.toString() === req.user.id) {
        existing.status = 'accepted';
        await existing.save();
        return res.status(200).json({ message: '¡Solicitud aceptada automáticamente!', friend: { id: friend._id, username: friend.username } });
      }

      // Si la enviaste tú, simplemente está pendiente
      return res.status(409).json({ error: 'Ya enviaste una solicitud a este usuario (está pendiente)' });
    }

    await Friend.create({ user_id: req.user.id, friend_id: friend._id, status: 'pending' });
    
    // Send Push Notification asynchronously
    sendNotificationToUser(friend._id.toString(), {
      title: '¡Nueva solicitud de amistad!',
      body: `${req.user.username} quiere ser tu amigo en Pokédex.`,
      icon: '/favicon.svg'
    });

    res.status(201).json({ message: 'Friend request sent', friend: { id: friend._id, username: friend.username } });
  } catch (err) {
    console.error('Add friend error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends
router.get('/', async (req, res) => {
  try {
    const friends = await Friend.find({
      $or: [{ user_id: req.user.id }, { friend_id: req.user.id }],
      status: 'accepted'
    }).populate('user_id', 'username friend_code').populate('friend_id', 'username friend_code');

    const mapped = friends.map(f => {
      const isSender = f.user_id._id.toString() === req.user.id;
      const friendUser = isSender ? f.friend_id : f.user_id;
      return {
        id: friendUser._id,
        friendship_id: f._id,
        username: friendUser.username,
        friend_code: friendUser.friend_code
      };
    });

    res.json({ friends: mapped });
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/friends/pending
router.get('/pending', async (req, res) => {
  try {
    const pending = await Friend.find({ friend_id: req.user.id, status: 'pending' })
      .populate('user_id', 'username friend_code');

    const mapped = pending.map(f => ({
      id: f._id,
      username: f.user_id.username,
      friend_code: f.user_id.friend_code,
      created_at: f.created_at
    }));

    res.json({ pending: mapped });
  } catch (err) {
    console.error('Get pending error:', err);
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
