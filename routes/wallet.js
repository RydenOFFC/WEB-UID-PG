const router = require('express').Router()
const pool = require('../db')
const { auth } = require('./middleware')

function typeLabel(type) {
  switch ((type || '').toUpperCase()) {
    case 'TOPUP': return '💳 Topup'
    case 'PURCHASE': return '🛒 Pembelian'
    case 'REDEEM': return '🎁 Redeem Kod'
    case 'REFUND': return '↩️ Refund'
    default: return type || 'Unknown'
  }
}

router.get('/', auth, async (req, res) => {
  try {
    const action = req.query.action
    const walletResult = await pool.query('SELECT balance FROM wallets WHERE user_id=$1', [req.userId])
    const balance = parseFloat(walletResult.rows[0]?.balance || 0)

    if (action === 'transactions') {
      const txs = await pool.query(
        'SELECT * FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
        [req.userId]
      )
      const transactions = txs.rows.map(tx => ({
        ...tx,
        amount: parseFloat(tx.amount),
        type_label: typeLabel(tx.type)
      }))
      return res.json({
        success: true,
        data: {
          transactions,
          balance,
          balance_label: `RM${balance.toFixed(2)}`,
          currency: 'MYR',
          symbol: 'RM'
        }
      })
    }

    if (action === 'purchases') {
      const txs = await pool.query(
        'SELECT * FROM wallet_transactions WHERE user_id=$1 AND type=$2 ORDER BY created_at DESC LIMIT 20',
        [req.userId, 'PURCHASE']
      )
      const purchases = txs.rows.map(tx => ({
        ...tx,
        amount: parseFloat(tx.amount),
        type_label: typeLabel(tx.type)
      }))
      return res.json({
        success: true,
        data: {
          purchases,
          balance,
          balance_label: `RM${balance.toFixed(2)}`,
          currency: 'MYR',
          symbol: 'RM'
        }
      })
    }

    res.json({
      success: true,
      data: {
        balance,
        balance_label: `RM${balance.toFixed(2)}`,
        currency: 'MYR',
        symbol: 'RM'
      }
    })
  } catch (error) {
    console.error('Wallet fetch failed', error)
    res.status(500).json({ success: false, error: 'Could not fetch wallet data' })
  }
})

router.post('/redeem', auth, async (req, res) => {
  const { code } = req.body
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid redeem code' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const redeemResult = await client.query(
      'SELECT * FROM redeem_codes WHERE code=$1 FOR UPDATE',
      [code.trim()]
    )

    if (redeemResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, error: 'Kode tidak valid' })
    }

    const redeem = redeemResult.rows[0]
    if (redeem.is_used) {
      await client.query('ROLLBACK')
      return res.status(400).json({ success: false, error: 'Kode sudah dipakai' })
    }

    if (redeem.expired_at && new Date(redeem.expired_at) < new Date()) {
      await client.query('ROLLBACK')
      return res.status(400).json({ success: false, error: 'Kode sudah expired' })
    }

    const amount = parseFloat(redeem.amount)
    await client.query(
      'UPDATE wallets SET balance = balance + $1 WHERE user_id = $2',
      [amount, req.userId]
    )
    await client.query(
      'UPDATE redeem_codes SET is_used = true, used_by = $1 WHERE id = $2',
      [req.userId, redeem.id]
    )
    await client.query(
      'INSERT INTO wallet_transactions (user_id, type, amount, note, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [req.userId, 'REDEEM', amount, `Redeem code: ${code.trim()}`]
    )
    await client.query('COMMIT')

    res.json({
      success: true,
      amount,
      amount_label: `RM${amount.toFixed(2)}`,
      message: 'Redeem code applied successfully'
    })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Redeem code failed', error)
    res.status(500).json({ success: false, error: 'Could not redeem code' })
  } finally {
    client.release()
  }
})

module.exports = router
