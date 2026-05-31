const router = require('express').Router()
const pool = require('../db')
const { auth } = require('./middleware')

router.post('/', auth, async (req, res) => {
  const { items } = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ success: false, error: 'No items specified' })
  }

  const productIds = [...new Set(items
    .map(item => parseInt(item.productId, 10))
    .filter(id => Number.isInteger(id) && id > 0)
  )]

  if (productIds.length === 0) {
    return res.json({ success: false, error: 'No valid product IDs' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const productResult = await client.query(
      'SELECT id, ff_id, uid, password, price FROM products WHERE id = ANY($1) AND status = $2 FOR UPDATE',
      [productIds, 'AVAILABLE']
    )

    if (productResult.rows.length !== productIds.length) {
      await client.query('ROLLBACK')
      return res.json({ success: false, error: 'Product no longer available' })
    }

    // Wallet balance and product prices are stored/expressed in BASE currency (USD).
    // Currency conversion must NOT be applied to this check; it affects ONLY display.
    const totalUsd = productResult.rows.reduce((sum, product) => sum + parseFloat(product.price), 0)

    const walletResult = await client.query(
      'SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE',
      [req.userId]
    )

    if (walletResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.json({ success: false, error: 'Wallet not found' })
    }

    const walletBalanceUsd = parseFloat(walletResult.rows[0].balance)
    if (walletBalanceUsd < totalUsd) {
      await client.query('ROLLBACK')
      return res.json({ success: false, error: 'Insufficient balance' })
    }

    await client.query('UPDATE wallets SET balance = balance - $1 WHERE user_id = $2', [totalUsd, req.userId])

    const soldItems = productResult.rows.map(product => ({
      ffId: product.ff_id,
      uid: product.uid,
      password: product.password
    }))

    for (const product of productResult.rows) {
      await client.query('UPDATE products SET status = $1 WHERE id = $2', ['SOLD', product.id])
      await client.query(
        'INSERT INTO wallet_transactions (user_id, type, amount, note, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [req.userId, 'PURCHASE', product.price, `Purchase: ${product.ff_id}`]
      )
    }

    await client.query('DELETE FROM carts WHERE user_id = $1', [req.userId])
    await client.query('COMMIT')

    res.json({ success: true, message: 'Purchase successful', data: { purchases: soldItems } })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(error)
    res.json({ success: false, error: 'Checkout failed' })
  } finally {
    client.release()
  }
})

module.exports = router
