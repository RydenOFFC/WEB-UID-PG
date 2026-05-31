const router = require('express').Router()
const pool = require('../db')
const { auth } = require('./middleware')

const rates = { USD:1, MYR:4.7, IDR:16000, PHP:58, SGD:1.35, THB:36 }
const symbols = { USD:'$', MYR:'RM', IDR:'Rp', PHP:'₱', SGD:'S$', THB:'฿' }

router.get('/wallet', auth, async (req, res) => {
  try {
    const action = req.query.action
    const currency = req.query.currency || 'USD'
    const rate = rates[currency] || 1
    const symbol = symbols[currency] || '$'

    const wallet = await pool.query('SELECT balance FROM wallets WHERE user_id=$1', [req.userId])
    const balance = parseFloat(wallet.rows[0]?.balance || 0)
    const convertedBalance = parseFloat((balance * rate).toFixed(2))

    if (action === 'transactions') {
      const txs = await pool.query('SELECT * FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.userId])
      const transactions = txs.rows.map(tx => ({
        ...tx,
        amount: parseFloat((parseFloat(tx.amount) * rate).toFixed(2))
      }))
      return res.json({ success: true, data: { transactions, currency, rate, symbol, balance: convertedBalance } })
    }

    if (action === 'purchases') {
      const txs = await pool.query(
        "SELECT * FROM wallet_transactions WHERE user_id=$1 AND type=$2 ORDER BY created_at DESC LIMIT 20",
        [req.userId, 'PURCHASE']
      )
      const purchases = txs.rows.map(tx => ({
        ...tx,
        amount: parseFloat((parseFloat(tx.amount) * rate).toFixed(2))
      }))
      return res.json({ success: true, data: { purchases, currency, rate, symbol, balance: convertedBalance } })
    }

    res.json({
      success: true,
      data: {
        balance: convertedBalance,
        balance_converted: convertedBalance,
        currency,
        rate,
        symbol
      }
    })
  } catch(e) { res.json({ success: false }) }
})

router.post('/wallet/redeem', auth, async (req, res) => {
  try {
    const { code } = req.body
    const redeem = await pool.query('SELECT * FROM redeem_codes WHERE code=$1 AND is_used=false', [code])
    if (redeem.rows.length === 0) return res.json({ success: false, error: 'Kode tidak valid atau sudah dipakai' })
    const r = redeem.rows[0]
    if (r.expired_at && new Date(r.expired_at) < new Date()) return res.json({ success: false, error: 'Kode sudah expired' })
    await pool.query('UPDATE wallets SET balance=balance+$1 WHERE user_id=$2', [r.amount, req.userId])
    await pool.query('UPDATE redeem_codes SET is_used=true,used_by=$1 WHERE id=$2', [req.userId, r.id])
    await pool.query('INSERT INTO wallet_transactions (user_id,type,amount,note,created_at) VALUES ($1,$2,$3,$4,NOW())', [req.userId, 'REDEEM', r.amount, 'Redeem code: '+code])
    res.json({ success: true, amount: r.amount })
  } catch(e) { res.json({ success: false }) }
})

module.exports = router