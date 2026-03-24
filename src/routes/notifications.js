const express = require('express');
const authMiddleware = require('../middleware/auth');
const Subscription = require('../models/Subscription');

const router = express.Router();

router.use(authMiddleware);

// POST /api/notifications/subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys) {
      return res.status(400).json({ error: 'Endpoint and keys are required' });
    }

    // Upsert subscription
    await Subscription.findOneAndUpdate(
      { endpoint },
      { user_id: req.user.id, keys },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: 'Subscription saved' });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
