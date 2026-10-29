const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_super_kampus_event_2026';

// Register for Users (Admin/Penyelenggara)
router.post('/register/user', async (req, res) => {
    try {
        const { email, password, nama_lengkap, no_whatsapp, jenis_kelamin, role } = req.body;
        const [existingUsers] = await db.execute('SELECT email FROM users WHERE email = ?', [email]);
        
        if (existingUsers.length > 0) return res.status(400).json({ message: 'Email sudah digunakan!' });

        const hashedPassword = await bcrypt.hash(password, 10);
        // Default role is penyelenggara if not provided. Superadmin creation should ideally be protected.
        const [result] = await db.execute(
            'INSERT INTO users (email, password, nama_lengkap, no_whatsapp, jenis_kelamin, role) VALUES (?, ?, ?, ?, ?, ?)',
            [email, hashedPassword, nama_lengkap, no_whatsapp, jenis_kelamin, role || 'penyelenggara']
        );

        res.status(201).json({ message: 'Registrasi user berhasil!', id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// Register for Mahasiswa
router.post('/register/mahasiswa', async (req, res) => {
    try {
        const { nim, email, password, nama_lengkap, jenis_kelamin, prodi, no_hp_mahasiswa } = req.body;
        
        // Cek NIM atau Email
        const [existing] = await db.execute('SELECT id FROM mahasiswa WHERE nim = ? OR email = ?', [nim, email]);
        if (existing.length > 0) return res.status(400).json({ message: 'NIM atau Email sudah terdaftar!' });

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await db.execute(
            'INSERT INTO mahasiswa (nim, email, password, nama_lengkap, jenis_kelamin, prodi, no_hp_mahasiswa) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nim, email, hashedPassword, nama_lengkap, jenis_kelamin, prodi, no_hp_mahasiswa]
        );

        res.status(201).json({ message: 'Registrasi mahasiswa berhasil!', id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// Universal Login
router.post('/login', async (req, res) => {
    try {
        const { identifier, password, type } = req.body; // type can be 'user' or 'mahasiswa'

        if (type === 'mahasiswa') {
            // Login as Mahasiswa using NIM or Email
            const [rows] = await db.execute('SELECT * FROM mahasiswa WHERE nim = ? OR email = ?', [identifier, identifier]);
            const mhs = rows[0];

            if (!mhs) return res.status(401).json({ message: 'Akun tidak ditemukan!' });

            if (mhs.status === 'inactive') {
                return res.status(403).json({ message: 'Akun Anda dinonaktifkan. Silakan hubungi admin.' });
            }

            const isPasswordMatch = await bcrypt.compare(password, mhs.password);
            if (!isPasswordMatch) return res.status(401).json({ message: 'Password salah!' });

            const token = jwt.sign(
                { id: mhs.id, identifier: mhs.nim, name: mhs.nama_lengkap, role: 'mahasiswa' },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            return res.json({
                message: 'Login mahasiswa berhasil!',
                token,
                user: { id: mhs.id, name: mhs.nama_lengkap, nim: mhs.nim, role: 'mahasiswa', foto_mahasiswa: mhs.foto_mahasiswa }
            });

        } else {
            // Login as User (Admin/Superadmin/Penyelenggara)
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [identifier]);
            const user = rows[0];

            if (!user) return res.status(401).json({ message: 'Akun tidak ditemukan!' });

            if (user.status === 'inactive') {
                return res.status(403).json({ message: 'Akun Anda dinonaktifkan. Silakan hubungi admin.' });
            }

            const isPasswordMatch = await bcrypt.compare(password, user.password);
            if (!isPasswordMatch) return res.status(401).json({ message: 'Password salah!' });

            const token = jwt.sign(
                { id: user.id, email: user.email, name: user.nama_lengkap, role: user.role },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            return res.json({
                message: 'Login berhasil!',
                token,
                user: { id: user.id, name: user.nama_lengkap, email: user.email, role: user.role, foto_profil: user.foto_profil }
            });
        }

    } catch (error) {
        console.error('LOGIN ERROR:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// Google Login for Mahasiswa
router.post('/google', async (req, res) => {
    try {
        const { token, action } = req.body;
        
        if (!token) {
            return res.status(401).json({ message: 'Token tidak ditemukan dari frontend' });
        }

        // Fetch user profile from Google using the access token via googleClient
        googleClient.setCredentials({ access_token: token });
        const googleResponse = await googleClient.request({ 
            url: 'https://www.googleapis.com/oauth2/v3/userinfo' 
        });

        const payload = googleResponse.data;
        if (!payload || !payload.email) {
            throw new Error('Gagal mendapatkan profil dari token OAuth Google');
        }
        const { sub: google_id, email, name, picture } = payload;

        // Cek apakah mahasiswa sudah ada
        const [rows] = await db.execute('SELECT * FROM mahasiswa WHERE email = ?', [email]);
        let mhs = rows[0];

        if (!mhs) {
            if (action === 'login') {
                return res.status(401).json({ message: 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.' });
            }
            // Register baru
            const [result] = await db.execute(
                'INSERT INTO mahasiswa (google_id, email, nama_lengkap, foto_mahasiswa, status) VALUES (?, ?, ?, ?, \'active\')',
                [google_id, email, name, picture]
            );
            mhs = { id: result.insertId, google_id, email, nama_lengkap: name, foto_mahasiswa: picture, nim: null, status: 'active' };
        } else {
            if (mhs.status === 'inactive') {
                return res.status(403).json({ message: 'Akun Anda dinonaktifkan. Silakan hubungi admin.' });
            }
            if (!mhs.google_id) {
                // Update google_id if existing by email but no google_id
                await db.execute('UPDATE mahasiswa SET google_id = ?, foto_mahasiswa = ? WHERE email = ?', [google_id, picture, email]);
            }
        }

        const jwtToken = jwt.sign(
            { id: mhs.id, email: mhs.email, name: mhs.nama_lengkap, role: 'mahasiswa' },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login Google berhasil!',
            token: jwtToken,
            user: { id: mhs.id, name: mhs.nama_lengkap, email: mhs.email, nim: mhs.nim, role: 'mahasiswa', foto_mahasiswa: mhs.foto_mahasiswa }
        });
    } catch (error) {
        console.error('Google Auth Error:', error);
        res.status(401).json({ message: 'Token Google tidak valid: ' + (error.message || 'Unknown error') });
    }
});

// Get Current Profile
router.get('/me', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Token tidak ditemukan.' });

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Token tidak valid.' });

        try {
            if (decoded.role === 'mahasiswa') {
                const [rows] = await db.execute('SELECT id, nim, nama_lengkap, email, jenis_kelamin, prodi, no_hp_mahasiswa, foto_mahasiswa FROM mahasiswa WHERE id = ?', [decoded.id]);
                return res.json({ user: { ...rows[0], role: 'mahasiswa' } });
            } else {
                const [rows] = await db.execute('SELECT id, nama_lengkap, email, no_whatsapp, jenis_kelamin, role, foto_profil FROM users WHERE id = ?', [decoded.id]);
                return res.json({ user: rows[0] });
            }
        } catch (dbErr) {
            return res.status(500).json({ message: 'Gagal mengambil data profil' });
        }
    });
});

module.exports = router;