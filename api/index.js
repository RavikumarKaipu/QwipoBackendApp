const express=require('express')
const sqlite3=require('sqlite3')
const {open}=require('sqlite')
const cors=require('cors')

const app = express();
app.use(cors());
app.use(express.json()); 


async function getDB() {
  return open({
    filename: './database.db',
    driver: sqlite3.Database,
  });
}


async function initDB() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
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


app.get('/', (req, res) => {
  const now = new Date();
  const message = `Server is running. Current date and time: ${now.toLocaleString()}`;
  res.status(200).json({ message });
});


// ---------------- CUSTOMER ROUTES ----------------

// Create customer
app.post('/api/customers', async (req, res) => {
  const { first_name, last_name, phone_number, address_details, city, state, pin_code } = req.body;
  if (!first_name || !last_name || !phone_number) return res.status(400).json({ error: 'Name and phone required' });

  const db = await getDB();
  const existing = await db.get('SELECT id FROM customers WHERE phone_number = ?', [phone_number]);
  if (existing) {
    await db.close();
    return res.status(400).json({ error: 'Phone number already exists' });
  }

  const result = await db.run('INSERT INTO customers (first_name, last_name, phone_number) VALUES (?, ?, ?)',
    [first_name, last_name, phone_number]);
  const customerId = result.lastID;

  if (address_details && city && state && pin_code) {
    await db.run(
      'INSERT INTO addresses (customer_id, address_details, city, state, pin_code) VALUES (?, ?, ?, ?, ?)',
      [customerId, address_details, city, state, pin_code]
    );
    await db.close();
    return res.json({ message: 'Customer + Address created', customer_id: customerId });
  }

  await db.close();
  return res.json({ message: 'Customer created (no address)', customer_id: customerId });
});

// Update customer
app.put('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, phone_number } = req.body;

  const db = await getDB();
  const duplicate = await db.get('SELECT id FROM customers WHERE phone_number = ? AND id != ?', [phone_number, id]);
  if (duplicate) {
    await db.close();
    return res.status(400).json({ error: 'Phone number already exists' });
  }

  await db.run('UPDATE customers SET first_name = ?, last_name = ?, phone_number = ? WHERE id = ?',
    [first_name, last_name, phone_number, id]);
  await db.close();
  res.json({ message: 'Customer updated' });
});

// Get all customers
app.get('/api/customers', async (req, res) => {
  const { page = 1, limit = 5, city, state, pin_code } = req.query;
  const db = await getDB();
  const offset = (page - 1) * limit;
  let sql = `SELECT c.*, COUNT(a.id) as address_count
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
  const { id } = req.params;
  const db = await getDB();
  const customer = await db.get('SELECT * FROM customers WHERE id = ?', [id]);
  await db.close();
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json({ message: 'success', data: customer });
});

// Delete customer
app.delete('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDB();
  await db.run('DELETE FROM addresses WHERE customer_id = ?', [id]);
  await db.run('DELETE FROM customers WHERE id = ?', [id]);
  await db.close();
  res.json({ message: 'Customer deleted' });
});

// ---------------- ADDRESS ROUTES ----------------

// Add address
app.post('/api/customers/:id/addresses', async (req, res) => {
  const { id } = req.params;
  const { address_details, city, state, pin_code } = req.body;
  if (!address_details || !city || !state || !pin_code) return res.status(400).json({ error: 'All address fields required' });

  const db = await getDB();
  const result = await db.run(
    'INSERT INTO addresses (customer_id, address_details, city, state, pin_code) VALUES (?, ?, ?, ?, ?)',
    [id, address_details, city, state, pin_code]
  );
  await db.close();
  res.json({ message: 'Address added', address_id: result.lastID });
});

// Get addresses
app.get('/api/customers/:id/addresses', async (req, res) => {
  const { id } = req.params;
  const db = await getDB();
  const rows = await db.all('SELECT * FROM addresses WHERE customer_id = ?', [id]);
  await db.close();
  res.json({ message: 'success', data: rows });
});

// Update address
app.put('/api/addresses/:addressId', async (req, res) => {
  const { addressId } = req.params;
  const { address_details, city, state, pin_code } = req.body;

  const db = await getDB();
  await db.run('UPDATE addresses SET address_details=?, city=?, state=?, pin_code=? WHERE id=?',
    [address_details, city, state, pin_code, addressId]);
  await db.close();
  res.json({ message: 'Address updated' });
});

// Delete address
app.delete('/api/addresses/:addressId', async (req, res) => {
  const { addressId } = req.params;
  const db = await getDB();
  await db.run('DELETE FROM addresses WHERE id=?', [addressId]);
  await db.close();
  res.json({ message: 'Address deleted' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
