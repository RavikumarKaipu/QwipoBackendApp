import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import Cors from 'cors';

// Enable CORS
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      resolve(result);
    });
  });
}
const cors = Cors({ origin: '*' });

async function getDB() {
  return open({
    filename: './database.db',
    driver: sqlite3.Database,
  });
}

async function initDB(db) {
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
}

// Single Vercel handler
export default async function handler(req, res) {
  await runMiddleware(req, res, cors);

  const db = await getDB();
  await initDB(db);

  const { method, body, query } = req;
  const { id, addressId } = query;

  // Root check
  if (req.url === '/') {
    const now = new Date();
    res.status(200).json({ message: `Server running. Current date: ${now.toLocaleString()}` });
    await db.close();
    return;
  }

  // ---------------- CUSTOMER ROUTES ----------------
  if (method === 'POST' && req.url.includes('/api/customers')) {
    const { first_name, last_name, phone_number, address_details, city, state, pin_code } = body;
    if (!first_name || !last_name || !phone_number) return res.status(400).json({ error: 'Name and phone required' });

    const existing = await db.get('SELECT id FROM customers WHERE phone_number = ?', [phone_number]);
    if (existing) { await db.close(); return res.status(400).json({ error: 'Phone exists' }); }

    const result = await db.run('INSERT INTO customers (first_name, last_name, phone_number) VALUES (?, ?, ?)',
      [first_name, last_name, phone_number]);
    const customerId = result.lastID;

    if (address_details && city && state && pin_code) {
      await db.run(
        'INSERT INTO addresses (customer_id, address_details, city, state, pin_code) VALUES (?, ?, ?, ?, ?)',
        [customerId, address_details, city, state, pin_code]
      );
      await db.close();
      return res.status(200).json({ message: 'Customer + Address created', customer_id: customerId });
    }

    await db.close();
    return res.status(200).json({ message: 'Customer created (no address)', customer_id: customerId });
  }

  if (method === 'GET' && req.url.includes('/api/customers')) {
    const rows = await db.all('SELECT * FROM customers');
    await db.close();
    return res.status(200).json({ message: 'success', data: rows });
  }

  if (method === 'GET' && req.url.includes('/api/customers/') && id) {
    const customer = await db.get('SELECT * FROM customers WHERE id = ?', [id]);
    await db.close();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    return res.status(200).json({ message: 'success', data: customer });
  }

  if (method === 'PUT' && req.url.includes('/api/customers/') && id) {
    const { first_name, last_name, phone_number } = body;
    await db.run('UPDATE customers SET first_name=?, last_name=?, phone_number=? WHERE id=?',
      [first_name, last_name, phone_number, id]);
    await db.close();
    return res.status(200).json({ message: 'Customer updated' });
  }

  if (method === 'DELETE' && req.url.includes('/api/customers/') && id) {
    await db.run('DELETE FROM addresses WHERE customer_id=?', [id]);
    await db.run('DELETE FROM customers WHERE id=?', [id]);
    await db.close();
    return res.status(200).json({ message: 'Customer deleted' });
  }

  // ---------------- ADDRESS ROUTES ----------------
  if (method === 'POST' && req.url.includes('/addresses') && id) {
    const { address_details, city, state, pin_code } = body;
    await db.run('INSERT INTO addresses (customer_id, address_details, city, state, pin_code) VALUES (?, ?, ?, ?, ?)',
      [id, address_details, city, state, pin_code]);
    await db.close();
    return res.status(200).json({ message: 'Address added' });
  }

  if (method === 'GET' && req.url.includes('/addresses') && id) {
    const rows = await db.all('SELECT * FROM addresses WHERE customer_id=?', [id]);
    await db.close();
    return res.status(200).json({ message: 'success', data: rows });
  }

  if (method === 'PUT' && req.url.includes('/addresses') && addressId) {
    const { address_details, city, state, pin_code } = body;
    await db.run('UPDATE addresses SET address_details=?, city=?, state=?, pin_code=? WHERE id=?',
      [address_details, city, state, pin_code, addressId]);
    await db.close();
    return res.status(200).json({ message: 'Address updated' });
  }

  if (method === 'DELETE' && req.url.includes('/addresses') && addressId) {
    await db.run('DELETE FROM addresses WHERE id=?', [addressId]);
    await db.close();
    return res.status(200).json({ message: 'Address deleted' });
  }

  await db.close();
  return res.status(404).json({ error: 'Route not found' });
}
