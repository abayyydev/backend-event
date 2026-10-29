const mysql = require('mysql2/promise');
require('dotenv').config(); // Load variabel dari .env

// Membuat pool koneksi menggunakan environment variables (global)
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'campusevent_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection()
    .then(() => console.log('✅ Berhasil terhubung ke Database MySQL Laragon!'))
    .catch((err) => console.error('❌ Gagal terhubung ke Database:', err));

module.exports = db;