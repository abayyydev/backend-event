const express = require('express');
const db = require('../config/database');
const { authenticateToken, isPenyelenggara } = require('../middleware/auth');
const bcrypt = require('bcrypt');

const router = express.Router();

// [1] GET Search Mahasiswa (untuk ditambahkan jadi tim)
router.get('/search', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 3) {
            return res.json([]);
        }

        const searchQuery = `%${q}%`;
        const [mahasiswa] = await db.execute(`
            SELECT id, nim, nama_lengkap, email, no_hp_mahasiswa
            FROM mahasiswa
            WHERE nim LIKE ? OR nama_lengkap LIKE ? OR email LIKE ?
            LIMIT 10
        `, [searchQuery, searchQuery, searchQuery]);

        res.json(mahasiswa);
    } catch (error) {
        console.error('Error searching mahasiswa:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [NEW] GET Events milik penyelenggara
router.get('/events', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const owner_id = req.user.owner_id || req.user.id;
        const [events] = await db.execute(`
            SELECT id, judul 
            FROM workshops 
            WHERE penyelenggara_id = ?
            ORDER BY tanggal_waktu DESC
        `, [owner_id]);
        res.json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [2] GET List Tim (dari event_committees)
router.get('/', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const owner_id = req.user.owner_id || req.user.id;
        
        const [tim] = await db.execute(`
            SELECT 
                ec.id as committee_id, 
                ec.role, 
                ec.created_at,
                m.id as mahasiswa_id,
                m.nama_lengkap, 
                m.email, 
                m.no_hp_mahasiswa as no_whatsapp,
                w.id as event_id,
                w.judul as event_name
            FROM event_committees ec
            JOIN mahasiswa m ON ec.mahasiswa_id = m.id
            JOIN workshops w ON ec.event_id = w.id
            WHERE w.penyelenggara_id = ?
            ORDER BY ec.created_at DESC
        `, [owner_id]);

        // Map data to match frontend expectations, adding event_name and role
        const formattedTim = tim.map(item => ({
            id: item.committee_id, // Important: ID for deletion is committee_id
            nama_lengkap: item.nama_lengkap,
            email: item.email,
            no_whatsapp: item.no_whatsapp,
            role: item.role,
            event_name: item.event_name,
            created_at: item.created_at
        }));

        res.json(formattedTim);
    } catch (error) {
        console.error('Error fetching tim:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [3] POST Tambah Tim (ke event_committees)
router.post('/', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const owner_id = req.user.owner_id || req.user.id;
        const { mahasiswa_id, workshop_id, role } = req.body;

        if (!mahasiswa_id || !workshop_id || !role) {
            return res.status(400).json({ message: 'Mahasiswa, Event, dan Role wajib diisi' });
        }

        // Pastikan event ini milik penyelenggara
        const [eventCheck] = await db.execute('SELECT id FROM workshops WHERE id = ? AND penyelenggara_id = ?', [workshop_id, owner_id]);
        if (eventCheck.length === 0) {
            return res.status(403).json({ message: 'Event tidak valid atau Anda tidak memiliki akses' });
        }

        // Pastikan mahasiswa valid
        const [mhs] = await db.execute('SELECT id FROM mahasiswa WHERE id = ?', [mahasiswa_id]);
        if (mhs.length === 0) {
            return res.status(404).json({ message: 'Mahasiswa tidak ditemukan' });
        }

        // Cek apakah mahasiswa sudah jadi panitia di event yang sama
        const [existing] = await db.execute('SELECT id FROM event_committees WHERE event_id = ? AND mahasiswa_id = ?', [workshop_id, mahasiswa_id]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Mahasiswa ini sudah terdaftar sebagai panitia di event tersebut.' });
        }

        // Insert ke event_committees
        await db.execute(`
            INSERT INTO event_committees (event_id, mahasiswa_id, role)
            VALUES (?, ?, ?)
        `, [workshop_id, mahasiswa_id, role]);

        res.status(201).json({ message: 'Berhasil menambahkan anggota tim ke event!' });

    } catch (error) {
        console.error('Error adding tim:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [4] DELETE Hapus Tim (dari event_committees)
router.delete('/:id', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const owner_id = req.user.owner_id || req.user.id;
        const { id } = req.params; // ini adalah id dari event_committees

        // Pastikan panitia ini ada di event milik penyelenggara ini
        const [committee] = await db.execute(`
            SELECT ec.id 
            FROM event_committees ec
            JOIN workshops w ON ec.event_id = w.id
            WHERE ec.id = ? AND w.penyelenggara_id = ?
        `, [id, owner_id]);

        if (committee.length === 0) {
            return res.status(403).json({ message: 'Anda tidak berhak menghapus anggota ini' });
        }

        await db.execute('DELETE FROM event_committees WHERE id = ?', [id]);
        res.json({ message: 'Anggota tim berhasil dihapus' });
    } catch (error) {
        console.error('Error deleting tim:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
