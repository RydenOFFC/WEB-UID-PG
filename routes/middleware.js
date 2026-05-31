const jwt = require('jsonwebtoken')

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.json({ success: false, error: 'Unauthorized' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = decoded.id
    req.userRole = decoded.role
    next()
  } catch { res.json({ success: false, error: 'Invalid token' }) }
}

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.json({ success: false, error: 'Unauthorized' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'ADMIN') return res.json({ success: false, error: 'Forbidden' })
    req.userId = decoded.id
    req.userRole = decoded.role
    next()
  } catch { res.json({ success: false, error: 'Invalid token' }) }
}

module.exports = { auth, adminAuth }
