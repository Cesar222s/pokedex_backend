const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function generateFriendCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateToken(user) {
  return jwt.sign(
    { id: user._id || user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password, and username are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    
    // Generate unique friend code with retry logic
    let friend_code;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      friend_code = generateFriendCode();
      const codeExists = await User.findOne({ friend_code });
      if (!codeExists) {
        console.log(`✅ Generated unique friend_code: ${friend_code} for user: ${email}`);
        break;
      }
      attempts++;
      console.warn(`⚠️  Friend code collision detected (attempt ${attempts}), regenerating...`);
    } while (attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      return res.status(500).json({ error: 'Could not generate unique friend code' });
    }

    const user = await User.create({ email, username, password_hash, friend_code });
    console.log(`✅ User registered: ${email} with friend_code: ${friend_code}`);
    
    const token = generateToken(user);

    res.status(201).json({ 
      user: { id: user._id, email: user.email, username: user.username, friend_code: user.friend_code }, 
      token 
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({ 
      user: { id: user._id, email: user.email, username: user.username, friend_code: user.friend_code }, 
      token 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('email username friend_code created_at');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: { id: user._id, ...user.toObject() } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
