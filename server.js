require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDb } = require('./db');

const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const employeeRoutes = require('./routes/employees');

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/employees', employeeRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log('R and A Dental Repair CRM listening on port ' + PORT));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
