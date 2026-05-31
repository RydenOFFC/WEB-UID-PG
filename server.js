require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const app = express()

app.use(cors())
app.use(express.json())

// Debug middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// API Routes FIRST (before static)
// ==================== PERBAIKAN RUTE API ====================

// 1. Taruh rute yang spesifik di paling atas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/bootstrap', require('./routes/bootstrap'));
app.use('/api/checkout', require('./routes/checkout'));

// ============================================================s
// Static files and catch-all AFTER API routes
app.use(express.static(path.join(__dirname, 'public')))

// Serve frontend for all unmatched routes
// Pakai app.use sebagai pengganti catch-all route
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: `API route '${req.path}' tidak ditemukan` })
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`ZephyrnUID running on port ${PORT}`))