const bcrypt = require('bcryptjs')
const pool = require('../db')

async function createAdmin() {
  const email = 'admin@rareids.com'
  const password = 'mauskin soyatzy77'
  const fullName = 'Admin RareIDs'
  const mobileNumber = '0000000000'
  const preferredCurrency = 'USD'

  try {
    const existing = await pool.query('SELECT id, role FROM users WHERE email=$1', [email])
    if (existing.rows.length > 0) {
      console.log(`Admin user already exists with email ${email} and role ${existing.rows[0].role}`)
      process.exit(0)
    }

    const hash = await bcrypt.hash(password, 10)
    const user = await pool.query(
      'INSERT INTO users (full_name, email, mobile_number, password, preferred_currency, role, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id',
      [fullName, email, mobileNumber, hash, preferredCurrency, 'ADMIN']
    )
    console.log('Admin account created:')
    console.log(`  email: ${email}`)
    console.log(`  password: ${password}`)
    console.log(`  id: ${user.rows[0].id}`)
    process.exit(0)
  } catch (err) {
    console.error('Failed to create admin account:', err)
    process.exit(1)
  }
}

createAdmin()
