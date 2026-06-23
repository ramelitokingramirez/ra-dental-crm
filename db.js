const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is not set. The app will fail to connect to a database.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      ticket_no TEXT UNIQUE NOT NULL,
      client_name TEXT NOT NULL,
      client_phone TEXT,
      client_email TEXT,
      device TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      serial TEXT NOT NULL,
      warranty TEXT NOT NULL,
      date_reported DATE NOT NULL,
      repair_status TEXT NOT NULL DEFAULT 'Received',
      technician TEXT,
      cost NUMERIC,
      notes TEXT,
      created_by INTEGER REFERENCES employees(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_counters (
      year INT PRIMARY KEY,
      seq INT NOT NULL DEFAULT 0
    );
  `);

  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM employees WHERE role = 'admin'");
  if (rows[0].c === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'changeme123';
    const fullName = process.env.ADMIN_FULL_NAME || 'Administrator';
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO employees (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (username) DO NOTHING`,
      [username, hash, fullName]
    );
    console.log('Seeded initial admin account: ' + username);
  }
}

module.exports = { pool, initDb };
