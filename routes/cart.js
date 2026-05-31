const router = require('express').Router()
const pool = require('../db')
const { auth } = require('./middleware')

router.post('/', auth, async (req, res) => {
  const { action, account_id, currency } = req.body

  try {
   if (action === 'add') {
  const ids = req.body.account_ids || (req.body.account_id ? [req.body.account_id] : [])
  if (!ids.length) return res.json({ success: false, error: 'No product specified' })
  
  for (const id of ids) {
    const product = await pool.query('SELECT * FROM products WHERE ff_id=$1 AND status=$2', [id, 'AVAILABLE'])
    if (product.rows.length === 0) continue
    const existing = await pool.query('SELECT id FROM carts WHERE user_id=$1 AND product_id=$2', [req.userId, product.rows[0].id])
    if (existing.rows.length > 0) continue
    await pool.query('INSERT INTO carts (user_id,product_id,created_at) VALUES ($1,$2,NOW())', [req.userId, product.rows[0].id])
  }
  return res.json({ success: true })
}

    if (action === 'remove') {
      const product = await pool.query('SELECT id FROM products WHERE ff_id=$1', [account_id])
      if (product.rows.length === 0) return res.json({ success: false, error: 'Product not found' })
      await pool.query('DELETE FROM carts WHERE user_id=$1 AND product_id=$2', [req.userId, product.rows[0].id])
      return res.json({ success: true })
    }

    if (action === 'get_detailed') {
  const cart = await pool.query(
    'SELECT c.*,p.price,p.ff_id,p.status FROM carts c JOIN products p ON c.product_id=p.id WHERE c.user_id=$1',
    [req.userId]
  )
  const items = cart.rows.map(i => ({
    ...i,
    account_id: i.ff_id,
    ffId: i.ff_id,
    status: i.status.toLowerCase()
  }))
      const subtotal = items.reduce((sum, i) => sum + parseFloat(i.price), 0)
return res.json({ 
  success: true, 
  data: {
    items,
    subtotal,
    final_amount: subtotal  // ← tambah ini

    }
  })
}

    res.json({ success: false, error: 'Invalid action' })

  } catch(e) {
    console.error(e)
    res.json({ success: false, error: 'Server error' })
  }
})
router.post('/checkout', auth, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cart = await client.query(
      'SELECT c.*,p.price,p.ff_id,p.uid,p.password FROM carts c JOIN products p ON c.product_id=p.id WHERE c.user_id=$1 AND p.status=$2',
      [req.userId, 'AVAILABLE']
    )
    if (cart.rows.length === 0) return res.json({ success: false, error: 'Cart kosong' })
    const wallet = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE', [req.userId])
    const total = cart.rows.reduce((sum, i) => sum + parseFloat(i.price), 0)
    if (wallet.rows[0].balance < total) return res.json({ success: false, error: 'Saldo tidak cukup' })
    await client.query('UPDATE wallets SET balance=balance-$1 WHERE user_id=$2', [total, req.userId])
    for (const item of cart.rows) {
      await client.query('UPDATE products SET status=$1 WHERE id=$2', ['SOLD', item.product_id])
      await client.query('INSERT INTO orders (user_id,product_id,amount_paid,currency_used,created_at) VALUES ($1,$2,$3,$4,NOW())', [req.userId, item.product_id, item.price, 'USD'])
      await client.query('INSERT INTO wallet_transactions (user_id,type,amount,note,created_at) VALUES ($1,$2,$3,$4,NOW())', [req.userId, 'PURCHASE', item.price, 'Purchase: '+item.ff_id])
    }
    await client.query('DELETE FROM carts WHERE user_id=$1', [req.userId])
    await client.query('COMMIT')
    res.json({ success: true, data: { items: cart.rows.map(i => ({ account_id: i.ff_id, ffId: i.ff_id, price: i.price, uid: i.uid, password: i.password })) }})
  } catch(e) {
    await client.query('ROLLBACK')
    console.error(e)
    res.json({ success: false, error: 'Checkout failed' })
  } finally { client.release() }
})
module.exports = router