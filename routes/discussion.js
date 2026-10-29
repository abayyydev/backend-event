const express = require('express');
const db = require('../config/database');
const { authenticateToken, isPenyelenggara } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Multer storage configuration for Event Materials
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../uploads/'));
    },
    filename: function (req, file, cb) {
        cb(null, 'materi-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Apply authentication and organizer checks globally to these routes
router.use(authenticateToken);
router.use(isPenyelenggara);

// Get all events owned by this organizer (or all events if superadmin) for chat channels
router.get('/organizer/events', async (req, res) => {
    try {
        let query = 'SELECT id, judul, poster, tanggal_waktu FROM workshops';
        let params = [];

        if (req.user.role !== 'superadmin') {
            query += ' WHERE penyelenggara_id = ?';
            params.push(req.user.id);
        }
        
        query += ' ORDER BY tanggal_waktu DESC';
        const [rows] = await db.execute(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Discussion Events Error:', error);
        res.status(500).json({ message: 'Gagal mengambil daftar event diskusi' });
    }
});

// Get chat messages for a specific workshop
router.get('/messages/:workshop_id', async (req, res) => {
    try {
        const { workshop_id } = req.params;

        // Verify ownership if not superadmin
        if (req.user.role !== 'superadmin') {
            const [check] = await db.execute('SELECT id FROM workshops WHERE id = ? AND penyelenggara_id = ?', [workshop_id, req.user.id]);
            if (check.length === 0) return res.status(403).json({ message: 'Akses ditolak! Anda bukan penyelenggara event ini.' });
        }

        const [messages] = await db.execute(
            `SELECT d.*, 
                    CASE WHEN d.user_type='mahasiswa' THEN (SELECT nama_lengkap FROM mahasiswa WHERE id=d.user_id)
                         ELSE (SELECT nama_lengkap FROM users WHERE id=d.user_id) END as nama_pengirim
             FROM workshop_discussions d 
             WHERE d.workshop_id = ? ORDER BY d.created_at ASC`, [workshop_id]
        );
        res.json(messages);
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ message: 'Gagal memuat diskusi' });
    }
});

// Post chat message as organizer/admin
router.post('/messages/:workshop_id', async (req, res) => {
    try {
        const { workshop_id } = req.params;
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ message: 'Pesan tidak boleh kosong' });
        }

        // Verify ownership if not superadmin
        if (req.user.role !== 'superadmin') {
            const [check] = await db.execute('SELECT id FROM workshops WHERE id = ? AND penyelenggara_id = ?', [workshop_id, req.user.id]);
            if (check.length === 0) return res.status(403).json({ message: 'Akses ditolak! Anda bukan penyelenggara event ini.' });
        }

        await db.execute(
            `INSERT INTO workshop_discussions (workshop_id, user_id, user_type, message) VALUES (?, ?, 'admin', ?)`,
            [workshop_id, req.user.id, message.trim()]
        );
        res.status(201).json({ message: 'Pesan dikirim!' });
    } catch (error) {
        console.error('Post Message Error:', error);
        res.status(500).json({ message: 'Gagal mengirim pesan' });
    }
});

// Get list of materials for a specific workshop
router.get('/materials/:workshop_id', async (req, res) => {
    try {
        const { workshop_id } = req.params;

        // Verify ownership if not superadmin
        if (req.user.role !== 'superadmin') {
            const [check] = await db.execute('SELECT id FROM workshops WHERE id = ? AND penyelenggara_id = ?', [workshop_id, req.user.id]);
            if (check.length === 0) return res.status(403).json({ message: 'Akses ditolak!' });
        }

        const [rows] = await db.execute(
            'SELECT * FROM workshop_materials WHERE workshop_id = ? ORDER BY uploaded_at DESC', [workshop_id]
        );
        res.json(rows);
    } catch (error) {
        console.error('Get Materials Error:', error);
        res.status(500).json({ message: 'Gagal mengambil materi' });
    }
});

// Upload material for a specific workshop
router.post('/materials/:workshop_id', upload.single('materi_file'), async (req, res) => {
    try {
        const { workshop_id } = req.params;
        const { judul_materi, deskripsi } = req.body;

        if (!judul_materi || !req.file) {
            return res.status(400).json({ message: 'Judul materi dan file wajib diunggah!' });
        }

        // Verify ownership if not superadmin
        if (req.user.role !== 'superadmin') {
            const [check] = await db.execute('SELECT id FROM workshops WHERE id = ? AND penyelenggara_id = ?', [workshop_id, req.user.id]);
            if (check.length === 0) {
                // Delete uploaded file if unauthorized
                fs.unlinkSync(req.file.path);
                return res.status(403).json({ message: 'Akses ditolak!' });
            }
        }

        await db.execute(
            'INSERT INTO workshop_materials (workshop_id, judul_materi, deskripsi, nama_file) VALUES (?, ?, ?, ?)',
            [workshop_id, judul_materi, deskripsi || null, req.file.filename]
        );

        res.status(201).json({ message: 'Materi berhasil diunggah!' });
    } catch (error) {
        console.error('Upload Material Error:', error);
        res.status(500).json({ message: 'Gagal mengunggah materi' });
    }
});

// Delete material
router.delete('/materials/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [materials] = await db.execute('SELECT * FROM workshop_materials WHERE id = ?', [id]);
        if (materials.length === 0) return res.status(404).json({ message: 'Materi tidak ditemukan' });
        const material = materials[0];

        // Verify ownership if not superadmin
        if (req.user.role !== 'superadmin') {
            const [check] = await db.execute('SELECT id FROM workshops WHERE id = ? AND penyelenggara_id = ?', [material.workshop_id, req.user.id]);
            if (check.length === 0) return res.status(403).json({ message: 'Akses ditolak!' });
        }

        // Delete physical file
        const filePath = path.join(__dirname, '..', 'uploads', material.nama_file);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await db.execute('DELETE FROM workshop_materials WHERE id = ?', [id]);
        res.json({ message: 'Materi berhasil dihapus!' });
    } catch (error) {
        console.error('Delete Material Error:', error);
        res.status(500).json({ message: 'Gagal menghapus materi' });
    }
});

module.exports = router;
