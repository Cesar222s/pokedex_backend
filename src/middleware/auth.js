const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn(`⚠️  No token provided in request to ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log(`✅ Token verified for user: ${decoded.email} (ID: ${decoded.id})`);
    next();
  } catch (err) {
    console.error(`❌ Token verification failed: ${err.message}`);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
