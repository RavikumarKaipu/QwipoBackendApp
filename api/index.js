const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Use /tmp/database.db for serverless writable storage
const DB_FILE = path.join('/tmp', 'database.db');

// Copy default database if not exists (first run)
if (!fs.existsSync(DB_FILE)) {
  const defaultDB = path.join(__dirname, 'database.db');
  if (fs.existsSync(defaultDB)) {
    fs.copyFileSync(defaultDB, DB_FILE);
  } else {
    // create empty database file
    fs.writeFileSync(DB_FILE, '');
  }
}

async function getDB() {
  return open({
    filename: DB_FILE,
    driver: sqlite3.Database,
  });
}

// Initialize database if tables do not exist
async function initDB() {
  const db = await getDB();
  await db.exec(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    address_details TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pin_code TEXT NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  )`);
  await db.close();
}
initDB();

// ---------------- ROUTES ----------------
app.get('/', (req, res) => {
  const now = new Date();
  res.status(200).json({ message: `Server running. Current time: ${now.toLocaleString()}` });
});

// Create customer
app.post('/api/customers', async (req, res) => {
  const { first_name, last_name, phone_number, address_details, city, state, pin_code } = req.body;
  if (!first_name || !last_name || !phone_number)
    return res.status(400).json({ error: 'Name and phone required' });

  const db = await getDB();
  const existing = await db.get('SELECT id FROM customers WHERE phone_number = ?', [phone_number]);
  if (existing) {
    await db.close();
    return res.status(400).json({ error: 'Phone number already exists' });
  }

  const result = await db.run(
    'INSERT INTO customers (first_name, last_name, phone_number) VALUES (?, ?, ?)',
    [first_name, last_name, phone_number]
  );
  const customerId = result.lastID;

  if (address_details && city && state && pin_code) {
    await db.run(
      'INSERT INTO addresses (customer_id, address_details, city, state, pin_code) VALUES (?, ?, ?, ?, ?)',
      [customerId, address_details, city, state, pin_code]
    );
  }

  await db.close();
  res.json({ message: 'Customer created', customer_id: customerId });
});

// Get all customers
app.get('/api/customers', async (req, res) => {
  const { page = 1, limit = 5, city, state, pin_code } = req.query;
  const db = await getDB();
  const offset = (page - 1) * limit;

  let sql = `SELECT c.*, COUNT(a.id) AS address_count
             FROM customers c
             LEFT JOIN addresses a ON c.id = a.customer_id`;
  const filters = [];
  const params = [];

  if (city) { filters.push('a.city = ?'); params.push(city); }
  if (state) { filters.push('a.state = ?'); params.push(state); }
  if (pin_code) { filters.push('a.pin_code = ?'); params.push(pin_code); }
  if (filters.length) sql += ' WHERE ' + filters.join(' AND ');

  sql += ' GROUP BY c.id LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const rows = await db.all(sql, params);
  await db.close();
  res.json({ message: 'success', data: rows });
});

// Get customer by ID
app.get('/api/customers/:id', async (req, res) => {
  const db = await getDB();
  const customer = await db.get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  await db.close();
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json({ message: 'success', data: customer });
});

// Delete customer
app.delete('/api/customers/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM addresses WHERE customer_id = ?', [req.params.id]);
  await db.run('DELETE FROM customers WHERE id = ?', [req.params.id]);
  await db.close();
  res.json({ message: 'Customer deleted' });
});

// Address routes
app.post('/api/customers/:id/addresses', async (req, res) => {
  const { address_details, city, state, pin_code } = req.body;
  if (!address_details || !city || !state || !pin_code)
    return res.status(400).json({ error: 'All address fields required' });

  const db = await getDB();
  const result = await db.run(
    'INSERT INTO addresses (customer_id, address_details, city, state, pin_code) VALUES (?, ?, ?, ?, ?)',
    [req.params.id, address_details, city, state, pin_code]
  );
  await db.close();
  res.json({ message: 'Address added', address_id: result.lastID });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
