const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function nextTicketNumber(dateReported) {
  const year = new Date(dateReported).getFullYear();
  const { rows } = await pool.query(
    `INSERT INTO ticket_counters (year, seq) VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET seq = ticket_counters.seq + 1
     RETURNING seq`,
    [year]
  );
  return 'RA-' + year + '-' + String(rows[0].seq).padStart(4, '0');
}

function parseCost(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const required = ['clientName', 'device', 'brand', 'model', 'serial', 'warranty', 'dateReported'];
  for (const f of required) {
    if (!b[f]) return res.status(400).json({ error: f + ' is required' });
  }
  try {
    const ticketNo = await nextTicketNumber(b.dateReported);
    const { rows } = await pool.query(
      `INSERT INTO tickets
        (ticket_no, client_name, client_phone, client_email, device, brand, model, serial,
         warranty, date_reported, repair_status, technician, cost, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        ticketNo, b.clientName, b.clientPhone || null, b.clientEmail || null,
        b.device, b.brand, b.model, b.serial, b.warranty, b.dateReported,
        b.repairStatus || 'Received', b.technician || null, parseCost(b.cost),
        b.notes || null, req.user.id
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

router.put('/:id', async (req, res) => {
  const b = req.body || {};
  const required = ['clientName', 'device', 'brand', 'model', 'serial', 'warranty', 'dateReported'];
  for (const f of required) {
    if (!b[f]) return res.status(400).json({ error: f + ' is required' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE tickets SET
        client_name = $1, client_phone = $2, client_email = $3, device = $4, brand = $5,
        model = $6, serial = $7, warranty = $8, date_reported = $9, repair_status = $10,
        technician = $11, cost = $12, notes = $13, updated_at = now()
       WHERE id = $14
       RETURNING *`,
      [
        b.clientName, b.clientPhone || null, b.clientEmail || null, b.device, b.brand,
        b.model, b.serial, b.warranty, b.dateReported, b.repairStatus || 'Received',
        b.technician || null, parseCost(b.cost), b.notes || null, req.params.id
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Ticket not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM tickets WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
});

module.exports = router;
