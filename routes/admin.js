const express = require('express');
const db = require('../config/database');
const bcrypt = require('bcrypt');
const { authenticateToken, isSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply superadmin authorization globally to all admin routes
router.use(authenticateToken);
router.use(isSuperAdmin);

// GET Superadmin Dashboard Stats
router.get('/dashboard/stats', async (req, res) => {
    try {
        const [[{ active_students }]] = await db.execute('SELECT COUNT(*) as active_students FROM mahasiswa WHERE status = "active"');
        const [[{ total_students }]] = await db.execute('SELECT COUNT(*) as total_students FROM mahasiswa');
        const [[{ active_organizers }]] = await db.execute('SELECT COUNT(*) as active_organizers FROM users WHERE role = "penyelenggara" AND status = "active"');
        const [[{ published_events }]] = await db.execute('SELECT COUNT(*) as published_events FROM workshops WHERE status = "approved"');
        const [[{ pending_events }]] = await db.execute('SELECT COUNT(*) as pending_events FROM workshops WHERE status = "draft"');
        
        res.json({
            stats: {
                active_students,
                total_students,
                active_organizers,
                published_events,
                pending_events
            }
        });
    } catch (error) {
        console.error('Superadmin Stats Error:', error);
        res.status(500).json({ message: 'Gagal mengambil statistik dashboard' });
    }
});

// =========================================================================
// MAHASISWA MANAGEMENT (CRUD + TOGGLE STATUS)
// =========================================================================

// Get All Mahasiswa
router.get('/mahasiswa', async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id, google_id, nim, nama_lengkap, email, jenis_kelamin, prodi, no_hp_mahasiswa, status, created_at FROM mahasiswa ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (error) {
        console.error('Admin Get Mahasiswa Error:', error);
        res.status(500).json({ message: 'Gagal mengambil data mahasiswa' });
    }
});

// Create Mahasiswa
router.post('/mahasiswa', async (req, res) => {
    try {
        const { nim, nama_lengkap, email, password, jenis_kelamin, prodi, no_hp_mahasiswa, status } = req.body;

        if (!nama_lengkap || !email) {
            return res.status(400).json({ message: 'Nama lengkap dan email wajib diisi!' });
        }

        // Check if NIM or Email already exists
        if (nim) {
            const [existingNim] = await db.execute('SELECT id FROM mahasiswa WHERE nim = ?', [nim]);
            if (existingNim.length > 0) return res.status(400).json({ message: 'NIM sudah terdaftar!' });
        }
        
        const [existingEmail] = await db.execute('SELECT id FROM mahasiswa WHERE email = ?', [email]);
        if (existingEmail.length > 0) return res.status(400).json({ message: 'Email sudah terdaftar!' });

        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const [result] = await db.execute(
            'INSERT INTO mahasiswa (nim, nama_lengkap, email, password, jenis_kelamin, prodi, no_hp_mahasiswa, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [nim || null, nama_lengkap, email, hashedPassword, jenis_kelamin || null, prodi || null, no_hp_mahasiswa || null, status || 'active']
        );

        res.status(201).json({ message: 'Mahasiswa berhasil ditambahkan!', id: result.insertId });
    } catch (error) {
        console.error('Admin Create Mahasiswa Error:', error);
        res.status(500).json({ message: 'Gagal menambahkan mahasiswa' });
    }
});

// Update Mahasiswa
router.put('/mahasiswa/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nim, nama_lengkap, email, password, jenis_kelamin, prodi, no_hp_mahasiswa, status } = req.body;

        if (!nama_lengkap || !email) {
            return res.status(400).json({ message: 'Nama lengkap dan email wajib diisi!' });
        }

        // Check duplicate NIM / Email
        if (nim) {
            const [existingNim] = await db.execute('SELECT id FROM mahasiswa WHERE nim = ? AND id != ?', [nim, id]);
            if (existingNim.length > 0) return res.status(400).json({ message: 'NIM sudah terdaftar pada mahasiswa lain!' });
        }

        const [existingEmail] = await db.execute('SELECT id FROM mahasiswa WHERE email = ? AND id != ?', [email, id]);
        if (existingEmail.length > 0) return res.status(400).json({ message: 'Email sudah terdaftar pada mahasiswa lain!' });

        let query = 'UPDATE mahasiswa SET nim = ?, nama_lengkap = ?, email = ?, jenis_kelamin = ?, prodi = ?, no_hp_mahasiswa = ?, status = ?';
        let params = [nim || null, nama_lengkap, email, jenis_kelamin || null, prodi || null, no_hp_mahasiswa || null, status || 'active'];

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(id);

        await db.execute(query, params);
        res.json({ message: 'Data mahasiswa berhasil diperbarui!' });
    } catch (error) {
        console.error('Admin Update Mahasiswa Error:', error);
        res.status(500).json({ message: 'Gagal memperbarui data mahasiswa' });
    }
});

// Delete Mahasiswa
router.delete('/mahasiswa/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Delete related pendaftaran and pendaftaran_data first
        await db.execute('DELETE FROM pendaftaran_data WHERE pendaftaran_id IN (SELECT id FROM pendaftaran WHERE mahasiswa_id = ?)', [id]);
        await db.execute('DELETE FROM pendaftaran WHERE mahasiswa_id = ?', [id]);
        await db.execute('DELETE FROM mahasiswa WHERE id = ?', [id]);

        res.json({ message: 'Mahasiswa dan data terkait berhasil dihapus!' });
    } catch (error) {
        console.error('Admin Delete Mahasiswa Error:', error);
        res.status(500).json({ message: 'Gagal menghapus mahasiswa' });
    }
});

// Toggle Status Mahasiswa (Active/Inactive)
router.patch('/mahasiswa/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (status !== 'active' && status !== 'inactive') {
            return res.status(400).json({ message: 'Status tidak valid! Harus "active" atau "inactive".' });
        }

        await db.execute('UPDATE mahasiswa SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: `Akun mahasiswa berhasil ${status === 'active' ? 'diaktifkan' : 'dinonaktifkan'}!` });
    } catch (error) {
        console.error('Admin Status Mahasiswa Error:', error);
        res.status(500).json({ message: 'Gagal mengubah status mahasiswa' });
    }
});

// =========================================================================
// USERS MANAGEMENT (CRUD + TOGGLE STATUS)
// =========================================================================

// Get All Users (superadmin / penyelenggara)
router.get('/users', async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id, nama_lengkap, email, no_whatsapp, jenis_kelamin, role, status, ukm, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (error) {
        console.error('Admin Get Users Error:', error);
        res.status(500).json({ message: 'Gagal mengambil data user' });
    }
});

// Create User
router.post('/users', async (req, res) => {
    try {
        const { nama_lengkap, email, no_whatsapp, jenis_kelamin, role, status, password, ukm } = req.body;

        if (!nama_lengkap || !email || !password || !role) {
            return res.status(400).json({ message: 'Nama lengkap, email, password, dan role wajib diisi!' });
        }

        // Check if email already exists
        const [existingEmail] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0) return res.status(400).json({ message: 'Email sudah terdaftar!' });

        if (no_whatsapp) {
            const [existingWa] = await db.execute('SELECT id FROM users WHERE no_whatsapp = ?', [no_whatsapp]);
            if (existingWa.length > 0) return res.status(400).json({ message: 'Nomor WhatsApp sudah terdaftar!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.execute(
            'INSERT INTO users (nama_lengkap, email, no_whatsapp, jenis_kelamin, role, status, password, ukm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [nama_lengkap, email, no_whatsapp || null, jenis_kelamin || null, role, status || 'active', hashedPassword, ukm || null]
        );

        res.status(201).json({ message: 'User berhasil ditambahkan!', id: result.insertId });
    } catch (error) {
        console.error('Admin Create User Error:', error);
        res.status(500).json({ message: 'Gagal menambahkan user' });
    }
});

// Update User
router.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nama_lengkap, email, no_whatsapp, jenis_kelamin, role, status, password, ukm } = req.body;

        if (!nama_lengkap || !email || !role) {
            return res.status(400).json({ message: 'Nama lengkap, email, dan role wajib diisi!' });
        }

        // Check duplicate email / WA
        const [existingEmail] = await db.execute('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
        if (existingEmail.length > 0) return res.status(400).json({ message: 'Email sudah terdaftar pada user lain!' });

        if (no_whatsapp) {
            const [existingWa] = await db.execute('SELECT id FROM users WHERE no_whatsapp = ? AND id != ?', [no_whatsapp, id]);
            if (existingWa.length > 0) return res.status(400).json({ message: 'Nomor WhatsApp sudah terdaftar pada user lain!' });
        }

        let query = 'UPDATE users SET nama_lengkap = ?, email = ?, no_whatsapp = ?, jenis_kelamin = ?, role = ?, status = ?, ukm = ?';
        let params = [nama_lengkap, email, no_whatsapp || null, jenis_kelamin || null, role, status || 'active', ukm || null];

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(id);

        await db.execute(query, params);
        res.json({ message: 'Data user berhasil diperbarui!' });
    } catch (error) {
        console.error('Admin Update User Error:', error);
        res.status(500).json({ message: 'Gagal memperbarui data user' });
    }
});

// Delete User
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ message: 'Anda tidak dapat menghapus akun Anda sendiri!' });
        }

        // Delete dependencies if any
        // Users might own workshops (events), let's set workshop penyelenggara_id to null or delete?
        // SQLite or MySQL: Let's set workshops.penyelenggara_id to NULL or handle cascade
        await db.execute('UPDATE workshops SET penyelenggara_id = NULL WHERE penyelenggara_id = ?', [id]);
        await db.execute('DELETE FROM users WHERE id = ?', [id]);

        res.json({ message: 'User berhasil dihapus!' });
    } catch (error) {
        console.error('Admin Delete User Error:', error);
        res.status(500).json({ message: 'Gagal menghapus user' });
    }
});

// Toggle Status User
router.patch('/users/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (status !== 'active' && status !== 'inactive') {
            return res.status(400).json({ message: 'Status tidak valid! Harus "active" atau "inactive".' });
        }

        if (parseInt(id) === req.user.id && status === 'inactive') {
            return res.status(400).json({ message: 'Anda tidak dapat menonaktifkan akun Anda sendiri!' });
        }

        await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: `Akun user berhasil ${status === 'active' ? 'diaktifkan' : 'dinonaktifkan'}!` });
    } catch (error) {
        console.error('Admin Status User Error:', error);
        res.status(500).json({ message: 'Gagal mengubah status user' });
    }
});

module.exports = router;
