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

    console.log(`\n📱 ========== PUSH SUBSCRIPTION REQUEST ==========`);
    console.log(`   User ID: ${req.user.id}`);
    console.log(`   User email: ${req.user.email}`);
    console.log(`   Endpoint: ${endpoint?.substring(0, 80)}...`);
    console.log(`   Keys p256dh: ${keys?.p256dh?.substring(0, 30)}...`);
    console.log(`   Keys auth: ${keys?.auth?.substring(0, 30)}...`);

    if (!endpoint || !keys) {
      console.warn(`⚠️  ❌ Missing endpoint or keys in subscription`);
      return res.status(400).json({ error: 'Endpoint and keys are required' });
    }

    // Convert req.user.id to ObjectId if it's a string
    const currentUserId = mongoose.Types.ObjectId.isValid(req.user.id) 
      ? new mongoose.Types.ObjectId(req.user.id)
      : req.user.id;

    console.log(`   Converting user ID: ${req.user.id} → ${currentUserId}`);

    // Delete old subscription for this endpoint first
    await Subscription.deleteMany({ endpoint });
    console.log(`   🗑️  Cleaned up old subscriptions for this endpoint`);

    // Create new subscription
    const savedSub = await Subscription.create({
      user_id: currentUserId,
      endpoint,
      keys
    });

    console.log(`✅ PUSH SUBSCRIPTION SAVED SUCCESSFULLY`);
    console.log(`   Subscription ID: ${savedSub._id}`);
    console.log(`   User ID stored: ${savedSub.user_id}`);
    console.log(`================================================\n`);

    res.status(201).json({ message: 'Subscription saved', subscriptionId: savedSub._id });
  } catch (err) {
    console.error(`\n❌ ========== SUBSCRIPTION ERROR ==========`);
    console.error(`   Error message: ${err.message}`);
    console.error(`   Error type: ${err.name}`);
    console.error(`   Stack: ${err.stack}`);
    console.error(`==========================================\n`);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
