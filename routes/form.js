const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Middleware helper untuk memastikan user adalah pemilik event atau superadmin
const checkEventOwnership = async (req, res, next) => {
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });
    
    const workshop_id = req.params.workshop_id || req.body.workshop_id;
    if (!workshop_id) return res.status(400).json({ message: 'workshop_id diperlukan' });

    try {
        const [workshops] = await db.execute('SELECT penyelenggara_id FROM workshops WHERE id = ?', [workshop_id]);
        if (workshops.length === 0) return res.status(404).json({ message: 'Event tidak ditemukan' });
        
        if (req.user.role !== 'superadmin' && workshops[0].penyelenggara_id !== req.user.id) {
            return res.status(403).json({ message: 'Akses ditolak!' });
        }
        next();
    } catch (error) {
        res.status(500).json({ message: 'Gagal memvalidasi event' });
    }
};

// [R]EAD: Ambil semua form fields berdasarkan workshop_id
router.get('/:workshop_id', authenticateToken, checkEventOwnership, async (req, res) => {
    try {
        const { workshop_id } = req.params;
        const [fields] = await db.execute(
            `SELECT * FROM form_fields WHERE workshop_id = ? ORDER BY urutan ASC, id ASC`,
            [workshop_id]
        );
        res.json(fields);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data form' });
    }
});

// [C]REATE / [U]PDATE: Tambah atau Edit Form Field
router.post('/:workshop_id', authenticateToken, checkEventOwnership, async (req, res) => {
    try {
        const { workshop_id } = req.params;
        const { id, label, field_type, is_required, options, placeholder, urutan } = req.body;
        
        if (id) {
            // Update
            await db.execute(
                `UPDATE form_fields SET label=?, field_type=?, is_required=?, options=?, placeholder=?, urutan=? WHERE id=? AND workshop_id=?`,
                [label, field_type, is_required ? 1 : 0, options || null, placeholder || null, urutan || 0, id, workshop_id]
            );
            res.json({ message: 'Field berhasil diperbarui!' });
        } else {
            // Insert
            await db.execute(
                `INSERT INTO form_fields (workshop_id, label, field_type, is_required, options, placeholder, urutan) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [workshop_id, label, field_type, is_required ? 1 : 0, options || null, placeholder || null, urutan || 0]
            );
            res.status(201).json({ message: 'Field berhasil ditambahkan!' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal menyimpan form field' });
    }
});

// [D]ELETE: Hapus Form Field
router.delete('/:id', authenticateToken, async (req, res) => {
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });

    try {
        const { id } = req.params;
        
        // Ambil workshop_id untuk validasi ownership
        const [fields] = await db.execute('SELECT workshop_id FROM form_fields WHERE id = ?', [id]);
        if (fields.length === 0) return res.status(404).json({ message: 'Field tidak ditemukan' });
        
        const workshop_id = fields[0].workshop_id;
        const [workshops] = await db.execute('SELECT penyelenggara_id FROM workshops WHERE id = ?', [workshop_id]);
        
        if (req.user.role !== 'superadmin' && workshops[0].penyelenggara_id !== req.user.id) {
            return res.status(403).json({ message: 'Akses ditolak!' });
        }

        await db.execute('DELETE FROM form_fields WHERE id = ?', [id]);
        res.json({ message: 'Field berhasil dihapus!' });
    } catch (error) {
        res.status(500).json({ message: 'Gagal menghapus form field' });
    }
});

module.exports = router;
