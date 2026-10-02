#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' || connectionString.includes('supabase')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const seedsDir = path.join(__dirname, '..', 'database', 'seeds');
    const files = fs.readdirSync(seedsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      let sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
      console.log(`Running seed ${file}...`);
      await pool.query(sql);
    }

    // Fix admin password with proper hash
    const adminHash = await bcrypt.hash('Admin123!', 12);
    await pool.query(
      `UPDATE admin_users SET password_hash = $1 WHERE username = 'admin'`,
      [adminHash]
    );

    console.log('Seed complete.');
    console.log('Default admin: admin / Admin123! (change in production)');
  } finally {
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
