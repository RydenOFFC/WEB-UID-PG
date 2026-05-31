const router = require('express').Router()
const pool = require('../db')

const rates = { USD:1, MYR:4.7, IDR:16000, PHP:58, SGD:1.35, THB:36 }
const symbols = { USD:'$', MYR:'RM', IDR:'Rp', PHP:'₱', SGD:'S$', THB:'฿' }

router.get('/', async (req, res) => {
  try {
    const currency = req.query.currency || 'USD'
    const rate = rates[currency] || 1
    const result = await pool.query('SELECT * FROM products WHERE status=$1 ORDER BY created_at DESC', ['AVAILABLE'])
    const items = result.rows.map(p => ({
      id: p.id,
      ffId: p.ff_id,
      price: parseFloat((p.price * rate).toFixed(2)),
      category: p.category,
      status: p.status.toLowerCase()
    }))
    res.json({ success: true, data: { items, currency, rate, symbol: symbols[currency]||'$' } })
  } catch(e) { console.error(e); res.json({ success: false }) }
})

module.exports = router
