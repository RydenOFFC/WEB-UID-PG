const router = require('express').Router()
const pool = require('../db')
const { adminAuth } = require('./middleware')

router.get('/listings', adminAuth, async (req, res) => {

  try {
    const result = await pool.query(
      'SELECT id, ff_id, price, category, status, created_at FROM products ORDER BY created_at DESC'
    )
    res.json({ success: true, data: result.rows })
  } catch (e) {
    console.error(e)
    res.json({ success: false, error: 'Server error' })
  }
})

router.get('/summary', adminAuth, async (req, res) => {
  try {
    const [users, products, available, sold] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM users'),
      pool.query('SELECT COUNT(*) AS count FROM products'),
      pool.query("SELECT COUNT(*) AS count FROM products WHERE status='AVAILABLE'"),
      pool.query("SELECT COUNT(*) AS count FROM products WHERE status='SOLD'")
    ])
    res.json({
      success: true,
      data: {
        users: parseInt(users.rows[0].count, 10),
        products: parseInt(products.rows[0].count, 10),
        available: parseInt(available.rows[0].count, 10),
        sold: parseInt(sold.rows[0].count, 10)
      }
    })
  } catch (e) {
    console.error(e)
    res.json({ success: false, error: 'Server error' })
  }
})
router.post('/products', adminAuth, async (req, res) => {
  try {
    const { ff_id, price, category, status, uid, password, account_id } = req.body
    if (!ff_id || !price) return res.json({ success: false, error: 'ff_id dan price wajib diisi' })
    const result = await pool.query(
     'INSERT INTO products (ff_id, price, category, status, uid, password) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
[ff_id, price, category || null, status || 'AVAILABLE', uid || account_id || null, password || null]
    )
    res.json({ success: true, data: result.rows[0] })
  } catch (e) {
    console.error(e)
    res.json({ success: false, error: 'Server error' })
  }
})
router.get('/users', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT u.id, u.full_name, u.email, w.balance FROM users u LEFT JOIN wallets w ON u.id = w.user_id ORDER BY u.id'
    )
    res.json({ success: true, data: result.rows })
  } catch (e) {
    console.error(e)
    res.json({ success: false, error: 'Server error' })
  }
})

router.post('/add-balance', adminAuth, async (req, res) => {
  try {
    const { user_id, amount } = req.body
    await pool.query('UPDATE wallets SET balance = balance + $1 WHERE user_id = $2', [amount, user_id])
    await pool.query(
      'INSERT INTO wallet_transactions (user_id, type, amount, note, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [user_id, 'TOPUP', amount, 'Admin top up']
    )
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.json({ success: false, error: 'Server error' })
  }
})
router.delete('/listings/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.json({ success: false, error: 'Server error' })
  }
})

module.exports = router
