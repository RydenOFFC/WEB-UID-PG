require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const checkoutRoutes = require('./routes/checkout')
const topupRoutes = require('./routes/topup')
const app = express()

app.use(cors())

app.post('/api/topup/webhook', express.raw({ type: 'application/json' }), topupRoutes.webhook)
app.post('/api/checkout/webhook', express.raw({ type: 'application/json' }), checkoutRoutes.webhook)

app.use(express.json())

// Debug middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// API Routes FIRST (before static)
app.use('/api/auth', require('./routes/auth'))
app.use('/api/cart', require('./routes/cart'))
app.use('/api/wallet', require('./routes/wallet'))
app.use('/api/admin', require('./routes/admin'))
app.use('/api/listings', require('./routes/listings'))
app.use('/api/bootstrap', require('./routes/bootstrap'))
app.use('/api/topup', topupRoutes.router)
app.use('/api/checkout', checkoutRoutes.router)

app.use(express.static(path.join(__dirname, 'public')))

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: `API route '${req.path}' tidak ditemukan` })
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`ZephyrnUID running on port ${PORT}`))
