const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, full_name, role, active, created_at FROM employees ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

router.post('/', async (req, res) => {
  const { username, password, fullName, role } = req.body || {};
  if (!username || !password || !fullName) {
    return res.status(400).json({ error: 'username, password, and fullName are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO employees (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, full_name, role, active, created_at`,
      [username, hash, fullName, role === 'admin' ? 'admin' : 'staff']
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That username already exists' });
    console.error(e);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

router.put('/:id', async (req, res) => {
  const { fullName, role, active, password } = req.body || {};
  try {
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      const hash = await bcrypt.hash(password, 10);
      await pool.query('UPDATE employees SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    }
    const { rows } = await pool.query(
      `UPDATE employees SET
        full_name = COALESCE($1, full_name),
        role = COALESCE($2, role),
        active = COALESCE($3, active)
       WHERE id = $4
       RETURNING id, username, full_name, role, active, created_at`,
      [fullName || null, role || null, active === undefined ? null : active, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

module.exports = router;
