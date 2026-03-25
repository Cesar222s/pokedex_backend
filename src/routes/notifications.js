const express = require('express');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Subscription = require('../models/Subscription');

const router = express.Router();

router.use(authMiddleware);

// POST /api/notifications/subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;

    console.log(`📱 Push subscription request received`);
    console.log(`   User ID: ${req.user.id}`);
    console.log(`   Endpoint: ${endpoint?.substring(0, 50)}...`);

    if (!endpoint || !keys) {
      console.warn(`⚠️  Missing endpoint or keys in subscription`);
      return res.status(400).json({ error: 'Endpoint and keys are required' });
    }

    // Convert req.user.id to ObjectId if it's a string
    const currentUserId = mongoose.Types.ObjectId.isValid(req.user.id) 
      ? req.user.id 
      : new mongoose.Types.ObjectId(req.user.id);

    // Upsert subscription
    const savedSub = await Subscription.findOneAndUpdate(
      { endpoint },
      { user_id: currentUserId, keys },
      { upsert: true, new: true }
    );

    console.log(`✅ Push subscription saved for user: ${req.user.email} (subscription ID: ${savedSub._id})`);
    res.status(201).json({ message: 'Subscription saved' });
  } catch (err) {
    console.error(`❌ Subscribe error:`, err.message);
    console.error(`   Stack:`, err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
