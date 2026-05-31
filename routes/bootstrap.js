const router = require('express').Router()
const pool = require('../db')
const { auth } = require('./middleware')

const rates = { USD:1, MYR:4.7, IDR:16000, PHP:58, SGD:1.35, THB:36 }
const symbols = { USD:'$', MYR:'RM', IDR:'Rp', PHP:'₱', SGD:'S$', THB:'฿' }

router.get('/', auth, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, full_name, email, preferred_currency, role FROM users WHERE id = $1',
      [req.userId]
    )
    if (userResult.rows.length === 0) return res.json({ success: false, error: 'User not found' })

    const walletResult = await pool.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [req.userId]
    )

    const cartResult = await pool.query(
      `SELECT c.id, p.ff_id, p.price, p.category
       FROM carts c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1`,
      [req.userId]
    )

    const user = userResult.rows[0]
    const currency = user.preferred_currency || 'USD'
    const rate = rates[currency] || 1
    const walletBalance = parseFloat(((walletResult.rows[0]?.balance || 0) * rate).toFixed(2))

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          role: user.role
        },
        wallet: {
          balance: walletBalance,
          balance_converted: walletBalance
        },
        cart: cartResult.rows.map(c => ({
          id: c.id,
          ffId: c.ff_id,
          price: parseFloat((c.price * rate).toFixed(2)),
          category: c.category
        })),
        currency,
        rate,
        symbol: symbols[currency] || '$'
      }
    })
  } catch (e) {
    console.error(e)
    res.json({ success: false })
  }
})

module.exports = router
