const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../uploads/'));
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// GET all adson for a workshop
router.get('/:workshop_id', async (req, res) => {
    try {
        const { workshop_id } = req.params;
        const [addons] = await db.execute(
            `SELECT * FROM event_addons WHERE workshop_id = ? ORDER BY created_at DESC`,
            [workshop_id]
        );
        res.json(addons);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal mengambil data adson' });
    }
});

// CREATE adson
router.post('/:workshop_id', authenticateToken, upload.single('gambar'), async (req, res) => {
    // Only Penyelenggara and Superadmin can create
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });
    
    try {
        const { workshop_id } = req.params;
        const { nama_barang, deskripsi, harga, stok } = req.body;
        const gambar = req.file ? `/uploads/${req.file.filename}` : req.body.gambar || null;
        
        const [result] = await db.execute(
            `INSERT INTO event_addons (workshop_id, nama_barang, deskripsi, harga, stok, gambar) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [workshop_id, nama_barang, deskripsi || '', harga || 0, stok || 0, gambar]
        );
        res.status(201).json({ message: 'Adson berhasil ditambahkan!', id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal menambah adson' });
    }
});

// UPDATE adson
router.put('/:id', authenticateToken, upload.single('gambar'), async (req, res) => {
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });
    
    try {
        const { id } = req.params;
        const { nama_barang, deskripsi, harga, stok } = req.body;
        
        let updateQuery = `UPDATE event_addons SET nama_barang = ?, deskripsi = ?, harga = ?, stok = ?`;
        let queryParams = [nama_barang, deskripsi || '', harga || 0, stok || 0];

        if (req.file) {
            updateQuery += `, gambar = ?`;
            queryParams.push(`/uploads/${req.file.filename}`);
        } else if (req.body.gambar !== undefined) {
            updateQuery += `, gambar = ?`;
            queryParams.push(req.body.gambar || null);
        }

        updateQuery += ` WHERE id = ?`;
        queryParams.push(id);
        
        await db.execute(updateQuery, queryParams);
        res.json({ message: 'Adson berhasil diperbarui!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal memperbarui adson' });
    }
});

// DELETE adson
router.delete('/:id', authenticateToken, async (req, res) => {
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });
    
    try {
        const { id } = req.params;
        await db.execute(`DELETE FROM event_addons WHERE id = ?`, [id]);
        res.json({ message: 'Adson berhasil dihapus!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal menghapus adson' });
    }
});

module.exports = router;
