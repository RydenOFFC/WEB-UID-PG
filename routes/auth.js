const router = require('express').Router()
const pool = require('../db')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

router.post('/test', async (req, res) => {
  res.json({ success: true, message: 'Auth endpoint is working' })
})

router.post('/', async (req, res) => {
  try {
    console.log('Auth POST received:', { hasAction: !!req.body.action, hasEmail: !!req.body.email })
    const { action, email, password, captcha_token, turnstileToken, fullName, name, mobileNumber, mobile_number, preferredCurrency, currency } = req.body
    
    if (action === 'login') {
      const user = await pool.query('SELECT * FROM users WHERE email=$1', [email])
      if (user.rows.length === 0) return res.json({ success: false, error: 'Email tidak ditemukan' })
      const valid = await bcrypt.compare(password, user.rows[0].password)
      if (!valid) return res.json({ success: false, error: 'Password salah' })
      const token = jwt.sign({ id: user.rows[0].id, role: user.rows[0].role }, process.env.JWT_SECRET, { expiresIn: '30d' })
      res.json({ success: true, data: { token } })
    } else if (action === 'register') {
      const fname = fullName || name
      const mnumber = mobileNumber || mobile_number
      const pcurrency = preferredCurrency || currency || 'USD'
      
      if (!fname || !email || !password) return res.json({ success: false, error: 'Data tidak lengkap' })
      
      const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email])
      if (existing.rows.length > 0) return res.json({ success: false, error: 'Email sudah terdaftar' })
      
      const hash = await bcrypt.hash(password, 10)
      const user = await pool.query(
        'INSERT INTO users (full_name,email,mobile_number,password,preferred_currency,role,created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id',
        [fname, email, mnumber, hash, pcurrency, 'USER']
      )
      await pool.query('INSERT INTO wallets (user_id,balance,updated_at) VALUES ($1,0,NOW())', [user.rows[0].id])
      const token = jwt.sign({ id: user.rows[0].id, role: 'USER' }, process.env.JWT_SECRET, { expiresIn: '30d' })
      res.json({ success: true, data: { token } })
    } else {
      res.json({ success: false, error: 'Invalid action' })
    }
  } catch(e) { 
    console.error('Auth error:', e)
    res.json({ success: false, error: 'Server error' }) 
  }
})

module.exports = router
