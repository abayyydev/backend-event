const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Mengimpor modular routes
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const formRoutes = require('./routes/form');
const kuesionerRoutes = require('./routes/kuesioner');
const adsonRoutes = require('./routes/adson');
const pendaftarRoutes = require('./routes/pendaftar');
const timRoutes = require('./routes/tim');
const mahasiswaRoutes = require('./routes/mahasiswa');
const adminRoutes = require('./routes/admin');
const discussionRoutes = require('./routes/discussion');

const app = express();

const path = require('path');

// Global Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Dibutuhkan untuk menerima POST data dari Duitku Callback
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================
// API ROUTES DAFTAR DI SINI
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/form', formRoutes);
app.use('/api/kuesioner', kuesionerRoutes);
app.use('/api/adson', adsonRoutes);
app.use('/api/pendaftar', pendaftarRoutes);
app.use('/api/tim', timRoutes);
app.use('/api/mahasiswa', mahasiswaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/discussion', discussionRoutes);

// Route utama untuk health check dari cPanel
app.get('/', (req, res) => {
    res.send('Backend API BEM Event berjalan dengan baik!');
});

// Route fallback untuk endpoint yang tidak ditemukan
app.use((req, res) => {
    res.status(404).json({ message: 'Endpoint tidak ditemukan' });
});

// ==========================================
// JALANKAN SERVER
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});