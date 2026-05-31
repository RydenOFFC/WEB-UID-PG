const fs = require('fs')
const pool = require('../db')

async function initDb() {
  try {
    const sql = fs.readFileSync(require('path').join(__dirname, '..', 'schema.sql'), 'utf8')
    await pool.query(sql)
    console.log('Database initialized successfully.')
    process.exit(0)
  } catch (err) {
    console.error('Failed to initialize database:', err)
    process.exit(1)
  }
}

initDb()
