const express = require('express');
const db = require('../config/database');
const { authenticateToken, isPenyelenggara, isSuperAdmin, isMahasiswa } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../uploads/'));
    },
    filename: function (req, file, cb) {
        let prefix = 'cert-';
        if (file.fieldname === 'poster') prefix = 'poster-';
        else if (file.fieldname === 'sponsor_logos') prefix = 'sponsor-';
        cb(null, prefix + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });
const uploadFields = upload.fields([
    { name: 'poster', maxCount: 1 },
    { name: 'sponsor_logos' }
]);

// [C]REATE: Bikin Event/Workshop Baru (Penyelenggara / Superadmin)
router.post('/', authenticateToken, uploadFields, async (req, res) => {
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });
    
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { judul, deskripsi, tanggal_waktu, jam_selesai, lokasi, visibilitas, tipe_event, harga, nominal_denda, maksimal_peserta, sponsors: sponsorsJson } = req.body;
        const poster = req.files && req.files['poster'] ? req.files['poster'][0].filename : null;

        // Insert event (status defaults to 'draft')
        const [result] = await conn.execute(
            `INSERT INTO workshops (penyelenggara_id, judul, deskripsi, poster, tanggal_waktu, jam_selesai, lokasi, visibilitas, tipe_event, harga, nominal_denda, maksimal_peserta, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
            [req.user.id, judul, deskripsi, poster, tanggal_waktu, jam_selesai || null, lokasi, visibilitas || 'public', tipe_event || 'gratis', harga || 0, nominal_denda || 0, maksimal_peserta || 0]
        );
        const eventId = result.insertId;

        // Process sponsors
        if (sponsorsJson) {
            const sponsors = JSON.parse(sponsorsJson);
            const sponsorFiles = req.files && req.files['sponsor_logos'] ? req.files['sponsor_logos'] : [];

            for (const sp of sponsors) {
                let logoFilename = '';
                if (sp.has_new_logo && sp.logo_index !== -1 && sponsorFiles[sp.logo_index]) {
                    logoFilename = sponsorFiles[sp.logo_index].filename;
                }
                
                await conn.execute(
                    `INSERT INTO event_sponsors (event_id, nama_sponsor, logo) VALUES (?, ?, ?)`,
                    [eventId, sp.nama, logoFilename]
                );
            }
        }

        await conn.commit();
        res.status(201).json({ message: 'Event berhasil dibuat!', id: eventId });
    } catch (error) {
        await conn.rollback();
        console.error(error);
        res.status(500).json({ message: 'Gagal membuat event' });
    } finally {
        conn.release();
    }
});

// GET Organizer Dashboard Stats
router.get('/organizer/stats', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const organizer_id = req.user.id;

        // 1. Total event aktif (approved)
        const [[{ active_events }]] = await db.execute(
            'SELECT COUNT(*) as active_events FROM workshops WHERE penyelenggara_id = ? AND status = "approved"',
            [organizer_id]
        );

        // 2. Total event draft
        const [[{ draft_events }]] = await db.execute(
            'SELECT COUNT(*) as draft_events FROM workshops WHERE penyelenggara_id = ? AND status = "draft"',
            [organizer_id]
        );

        // 3. Total tiket terjual (paid atau free)
        const [[{ tickets_sold }]] = await db.execute(
            `SELECT COUNT(*) as tickets_sold 
             FROM pendaftaran p JOIN workshops w ON p.workshop_id = w.id 
             WHERE w.penyelenggara_id = ? AND (p.status_pembayaran = 'paid' || p.status_pembayaran = 'free')`,
            [organizer_id]
        );

        // 4. Estimasi Pendapatan Total (dari tiket + denda lunas)
        // Pendapatan tiket
        const [[{ ticket_revenue }]] = await db.execute(
            `SELECT COALESCE(SUM(CASE WHEN w.tipe_event = 'gratis' THEN 0 ELSE w.harga END), 0) as ticket_revenue
             FROM pendaftaran p JOIN workshops w ON p.workshop_id = w.id
             WHERE w.penyelenggara_id = ? AND (p.status_pembayaran = 'paid' || p.status_pembayaran = 'free')`,
            [organizer_id]
        );
        
        // Pendapatan denda lunas
        const [[{ fine_revenue }]] = await db.execute(
            `SELECT COALESCE(SUM(w.nominal_denda), 0) as fine_revenue
             FROM pendaftaran p JOIN workshops w ON p.workshop_id = w.id
             WHERE w.penyelenggara_id = ? AND p.status_denda = 'lunas'`,
            [organizer_id]
        );

        // 5. Daftar event terbaru (5) beserta statistik pendaftar
        const [recent_events] = await db.execute(
            `SELECT w.id, w.judul, w.tanggal_waktu, w.status, w.tipe_event, w.harga,
                    (SELECT COUNT(*) FROM pendaftaran p WHERE p.workshop_id = w.id AND p.status_pembayaran != 'failed') as total_registrants
             FROM workshops w
             WHERE w.penyelenggara_id = ?
             ORDER BY w.tanggal_waktu DESC LIMIT 5`,
            [organizer_id]
        );

        res.json({
            stats: {
                active_events,
                draft_events,
                tickets_sold,
                estimated_revenue: Number(ticket_revenue) + Number(fine_revenue),
                ticket_revenue: Number(ticket_revenue),
                fine_revenue: Number(fine_revenue)
            },
            recent_events
        });
    } catch (error) {
        console.error('Organizer Stats Error:', error);
        res.status(500).json({ message: 'Gagal memuat statistik dashboard' });
    }
});

// [R]EAD: Ambil semua event (Public & Internal)
// Jika Public -> semua bisa lihat. Jika Internal -> mungkin butuh logic khusus, sementara return semua public
router.get('/', async (req, res) => {
    try {
        const [workshops] = await db.execute(
            `SELECT w.*, u.nama_lengkap as nama_penyelenggara, u.ukm as ukm_penyelenggara 
             FROM workshops w 
             LEFT JOIN users u ON w.penyelenggara_id = u.id 
             WHERE w.visibilitas = 'public' AND w.status = 'approved' 
             ORDER BY w.tanggal_waktu DESC`
        );
        res.json(workshops);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data event' });
    }
});

// [R]EAD: Ambil event milik penyelenggara / superadmin
router.get('/manage', authenticateToken, async (req, res) => {
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });

    try {
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const offset = (page - 1) * limit;

        let whereClause = ` WHERE w.judul LIKE ?`;
        let params = [`%${search}%`];
        let countParams = [`%${search}%`];

        if (req.user.role !== 'superadmin') {
            whereClause += ` AND w.penyelenggara_id = ?`;
            params.push(req.user.id);
            countParams.push(req.user.id);
        }

        const [countResult] = await db.execute(`SELECT COUNT(*) as total FROM workshops w ${whereClause}`, countParams);
        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        let query = `SELECT w.*, 
             (SELECT COUNT(*) FROM pendaftaran p WHERE p.workshop_id = w.id) as total_participants
             FROM workshops w ${whereClause} ORDER BY w.tanggal_waktu DESC LIMIT ${limit} OFFSET ${offset}`;

        const [workshops] = await db.execute(query, params);
        
        res.json({
            data: workshops,
            pagination: {
                total_records: totalRecords,
                total_pages: totalPages,
                current_page: page,
                limit: limit
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal mengambil data event' });
    }
});

// [R]EAD DETAIL: Ambil 1 Event
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [workshops] = await db.execute('SELECT * FROM workshops WHERE id = ?', [id]);
        
        if (workshops.length === 0) return res.status(404).json({ message: 'Event tidak ditemukan' });
        
        const [sponsors] = await db.execute('SELECT * FROM event_sponsors WHERE event_id = ?', [id]);
        const event = workshops[0];
        event.sponsors = sponsors;

        res.json(event);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil detail event' });
    }
});

// [U]PDATE: Simpan perubahan Edit Event
router.put('/:id', authenticateToken, uploadFields, async (req, res) => {
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });

    const { id } = req.params;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { judul, deskripsi, tanggal_waktu, jam_selesai, lokasi, visibilitas, tipe_event, harga, nominal_denda, maksimal_peserta, sponsors: sponsorsJson } = req.body;
        
        const [workshops] = await conn.execute('SELECT penyelenggara_id FROM workshops WHERE id = ?', [id]);
        if (workshops.length === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'Event tidak ditemukan' });
        }
        
        if (req.user.role !== 'superadmin' && workshops[0].penyelenggara_id !== req.user.id) {
            await conn.rollback();
            return res.status(403).json({ message: 'Akses ditolak!' });
        }

        let query = `UPDATE workshops SET judul=?, deskripsi=?, tanggal_waktu=?, jam_selesai=?, lokasi=?, visibilitas=?, tipe_event=?, harga=?, nominal_denda=?, maksimal_peserta=?`;
        let params = [judul, deskripsi, tanggal_waktu, jam_selesai || null, lokasi, visibilitas || 'public', tipe_event || 'gratis', harga || 0, nominal_denda || 0, maksimal_peserta || 0];

        if (req.files && req.files['poster']) {
            query += `, poster=?`;
            params.push(req.files['poster'][0].filename);
        }

        query += ` WHERE id=?`;
        params.push(id);

        await conn.execute(query, params);

        // Process sponsors
        if (sponsorsJson) {
            const sponsors = JSON.parse(sponsorsJson);
            const sponsorFiles = req.files && req.files['sponsor_logos'] ? req.files['sponsor_logos'] : [];

            // 1. Delete sponsors that are no longer in the list
            const keepIds = sponsors.filter(sp => sp.id).map(sp => sp.id);
            if (keepIds.length > 0) {
                const placeholders = keepIds.map(() => '?').join(',');
                await conn.execute(`DELETE FROM event_sponsors WHERE event_id = ? AND id NOT IN (${placeholders})`, [id, ...keepIds]);
            } else {
                await conn.execute(`DELETE FROM event_sponsors WHERE event_id = ?`, [id]);
            }

            // 2. Insert or update sponsors
            for (const sp of sponsors) {
                let logoFilename = sp.logo_lama || '';
                if (sp.has_new_logo && sp.logo_index !== -1 && sponsorFiles[sp.logo_index]) {
                    logoFilename = sponsorFiles[sp.logo_index].filename;
                }

                if (sp.id) {
                    // Update
                    await conn.execute(
                        `UPDATE event_sponsors SET nama_sponsor = ?, logo = ? WHERE id = ? AND event_id = ?`,
                        [sp.nama, logoFilename, sp.id, id]
                    );
                } else {
                    // Insert
                    await conn.execute(
                        `INSERT INTO event_sponsors (event_id, nama_sponsor, logo) VALUES (?, ?, ?)`,
                        [id, sp.nama, logoFilename]
                    );
                }
            }
        }

        await conn.commit();
        res.json({ message: 'Event berhasil diperbarui!' });
    } catch (error) {
        await conn.rollback();
        console.error(error);
        res.status(500).json({ message: 'Gagal memperbarui event' });
    } finally {
        conn.release();
    }
});

// [D]ELETE: Hapus Event
router.delete('/:id', authenticateToken, async (req, res) => {
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });

    try {
        const { id } = req.params;
        const [workshops] = await db.execute('SELECT penyelenggara_id FROM workshops WHERE id = ?', [id]);
        
        if (workshops.length === 0) return res.status(404).json({ message: 'Event tidak ditemukan' });
        
        if (req.user.role !== 'superadmin' && workshops[0].penyelenggara_id !== req.user.id) {
            return res.status(403).json({ message: 'Akses ditolak!' });
        }

        await db.execute('DELETE FROM workshops WHERE id = ?', [id]);
        res.json({ message: 'Event berhasil dihapus!' });
    } catch (error) {
        res.status(500).json({ message: 'Gagal menghapus event' });
    }
});

// MAHASISWA: Daftar ke event
router.post('/:id/register', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const { id } = req.params;
        const { nama_peserta, email_peserta, telepon_peserta } = req.body;

        // Cek apakah event ada
        const [workshops] = await db.execute('SELECT * FROM workshops WHERE id = ?', [id]);
        if (workshops.length === 0) return res.status(404).json({ message: 'Event tidak ditemukan' });

        const workshop = workshops[0];

        // Cek kuota peserta
        if (workshop.maksimal_peserta > 0) {
            const [[participantCount]] = await db.execute('SELECT COUNT(*) as count FROM pendaftaran WHERE workshop_id = ? AND status_pembayaran != "failed"', [id]);
            if (participantCount.count >= workshop.maksimal_peserta) {
                return res.status(400).json({ message: 'Mohon maaf, kuota peserta sudah penuh!' });
            }
        }

        // Cek apakah mahasiswa sudah mendaftar
        const [existing] = await db.execute('SELECT id FROM pendaftaran WHERE workshop_id = ? AND mahasiswa_id = ?', [id, req.user.id]);
        if (existing.length > 0) return res.status(400).json({ message: 'Anda sudah mendaftar di event ini!' });

        const kode_unik = 'WS-' + id + '-' + Math.random().toString(16).substr(2, 6).toUpperCase();
        const status_pembayaran = workshop.tipe_event === 'gratis' ? 'free' : 'pending';

        await db.execute(
            `INSERT INTO pendaftaran (workshop_id, mahasiswa_id, nama_peserta, email_peserta, telepon_peserta, kode_unik, status_pembayaran, didaftarkan_oleh)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'user')`,
            [id, req.user.id, nama_peserta || req.user.name, email_peserta, telepon_peserta, kode_unik, status_pembayaran]
        );

        res.status(201).json({ message: 'Pendaftaran berhasil!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal mendaftar event' });
    }
});

// [U]PDATE: Setting Sertifikat (Penyelenggara)
router.put('/:id/sertifikat', authenticateToken, upload.single('sertifikat_template'), async (req, res) => {
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });
    
    try {
        const { id } = req.params;
        const {
            sertifikat_prefix,
            sertifikat_nomor_awal,
            sertifikat_nama_fs,
            sertifikat_nama_y_percent,
            sertifikat_nama_x_percent,
            sertifikat_nomor_fs,
            sertifikat_nomor_y_percent,
            sertifikat_nomor_x_percent,
            sertifikat_font,
            sertifikat_orientasi,
            sertifikat_custom_fs,
            sertifikat_custom_x_percent,
            sertifikat_custom_y_percent,
            sertifikat_custom_type,
            sertifikat_custom_global_text
        } = req.body;

        const sertifikat_template = req.file ? `/uploads/${req.file.filename}` : req.body.sertifikat_template;

        const [result] = await db.execute(
            `UPDATE workshops SET 
                sertifikat_template = COALESCE(?, sertifikat_template),
                sertifikat_prefix = ?,
                sertifikat_nomor_awal = ?,
                sertifikat_nama_fs = ?,
                sertifikat_nama_y_percent = ?,
                sertifikat_nama_x_percent = ?,
                sertifikat_nomor_fs = ?,
                sertifikat_nomor_y_percent = ?,
                sertifikat_nomor_x_percent = ?,
                sertifikat_font = ?,
                sertifikat_orientasi = ?,
                sertifikat_custom_fs = ?,
                sertifikat_custom_x_percent = ?,
                sertifikat_custom_y_percent = ?,
                sertifikat_custom_type = ?,
                sertifikat_custom_global_text = ?
            WHERE id = ? AND penyelenggara_id = ?`,
            [
                sertifikat_template || null,
                sertifikat_prefix || null,
                sertifikat_nomor_awal || 1,
                sertifikat_nama_fs || 120,
                sertifikat_nama_y_percent || 50.00,
                sertifikat_nama_x_percent || 50.00,
                sertifikat_nomor_fs || 40,
                sertifikat_nomor_y_percent || 60.00,
                sertifikat_nomor_x_percent || 50.00,
                sertifikat_font || 'Poppins-SemiBold.ttf',
                sertifikat_orientasi || 'portrait',
                sertifikat_custom_fs || 30,
                sertifikat_custom_x_percent || 50.00,
                sertifikat_custom_y_percent || 70.00,
                sertifikat_custom_type || 'none',
                sertifikat_custom_global_text || null,
                id,
                req.user.role === 'superadmin' ? workshops[0].penyelenggara_id : req.user.id
            ]
        );

        res.json({ message: 'Pengaturan sertifikat berhasil disimpan!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal menyimpan pengaturan sertifikat' });
    }
});

// [U]PDATE STATUS: Approve/Reject Event (Superadmin only)
router.patch('/:id/status', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // status can be 'approved' or 'rejected' or 'draft'

        if (!['approved', 'rejected', 'draft'].includes(status)) {
            return res.status(400).json({ message: 'Status tidak valid' });
        }

        const [result] = await db.execute(
            `UPDATE workshops SET status = ? WHERE id = ?`,
            [status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Event tidak ditemukan' });
        }

        res.json({ message: `Event berhasil di-${status === 'approved' ? 'setujui' : status === 'rejected' ? 'tolak' : 'kembalikan ke draft'}!` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal mengubah status event' });
    }
});

module.exports = router;