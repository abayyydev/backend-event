const express = require('express');
const db = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { authenticateToken, isMahasiswa } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Multer for profile photo upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
    filename: (req, file, cb) => cb(null, 'mhs-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ============================================================
// DASHBOARD
// ============================================================
router.get('/dashboard', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;

        // Stats
        const [[{ event_diikuti }]] = await db.execute(
            `SELECT COUNT(*) as event_diikuti FROM pendaftaran WHERE mahasiswa_id = ? AND (status_pembayaran='paid' OR status_pembayaran='free')`, [mhs_id]
        );
        const [[{ tiket_aktif }]] = await db.execute(
            `SELECT COUNT(*) as tiket_aktif FROM pendaftaran p JOIN workshops w ON p.workshop_id=w.id WHERE p.mahasiswa_id = ? AND (p.status_pembayaran='paid' OR p.status_pembayaran='free') AND w.tanggal_waktu >= NOW()`, [mhs_id]
        );
        const [[{ sertifikat }]] = await db.execute(
            `SELECT COUNT(*) as sertifikat FROM pendaftaran p JOIN workshops w ON p.workshop_id=w.id WHERE p.mahasiswa_id = ? AND p.status_kehadiran='hadir' AND w.sertifikat_template IS NOT NULL`, [mhs_id]
        );

        // Tiket saya (3 terbaru)
        const [tiket_saya] = await db.execute(
            `SELECT p.*, w.judul, w.tanggal_waktu, w.lokasi, w.poster, w.id as workshop_id, u.ukm as ukm_penyelenggara 
             FROM pendaftaran p 
             JOIN workshops w ON p.workshop_id=w.id 
             LEFT JOIN users u ON w.penyelenggara_id = u.id
             WHERE p.mahasiswa_id = ? ORDER BY p.created_at DESC LIMIT 3`, [mhs_id]
        );

        // Agenda terbaru (6 event terdekat)
        const [agendas] = await db.execute(
            `SELECT w.*, u.ukm as ukm_penyelenggara 
             FROM workshops w 
             LEFT JOIN users u ON w.penyelenggara_id = u.id
             WHERE w.tanggal_waktu >= NOW() AND w.status = 'approved' ORDER BY w.tanggal_waktu ASC LIMIT 6`
        );

        res.json({ stats: { event_diikuti, tiket_aktif, sertifikat }, tiket_saya, agendas });
    } catch (error) {
        console.error('Dashboard Error:', error);
        res.status(500).json({ message: 'Gagal memuat dashboard' });
    }
});

// ============================================================
// KATALOG EVENT
// ============================================================
router.get('/katalog', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const { q, tipe } = req.query;

        let sql = `SELECT w.*, u.nama_lengkap as nama_penyelenggara, u.ukm as ukm_penyelenggara,
                    (SELECT COUNT(*) FROM pendaftaran p WHERE p.workshop_id = w.id AND p.mahasiswa_id = ?) as is_registered
                    FROM workshops w 
                    LEFT JOIN users u ON w.penyelenggara_id = u.id
                    WHERE w.tanggal_waktu >= NOW() AND w.status = 'approved'`;
        const params = [mhs_id];

        if (q) {
            sql += ` AND (w.judul LIKE ? OR w.deskripsi LIKE ? OR w.lokasi LIKE ?)`;
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (tipe === 'gratis') sql += ` AND (w.tipe_event='gratis' OR w.harga <= 0)`;
        else if (tipe === 'berbayar') sql += ` AND (w.tipe_event='berbayar' AND w.harga > 0)`;

        sql += ` ORDER BY w.tanggal_waktu ASC`;
        const [events] = await db.execute(sql, params);
        res.json(events);
    } catch (error) {
        console.error('Katalog Error:', error);
        res.status(500).json({ message: 'Gagal memuat katalog event' });
    }
});

// Detail Event
router.get('/katalog/:id', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const { id } = req.params;

        const [events] = await db.execute(
            `SELECT w.*, u.nama_lengkap as nama_penyelenggara, u.ukm as ukm_penyelenggara 
             FROM workshops w 
             LEFT JOIN users u ON w.penyelenggara_id = u.id 
             WHERE w.id = ?`, 
            [id]
        );
        if (events.length === 0) return res.status(404).json({ message: 'Event tidak ditemukan' });

        const [[{ is_registered }]] = await db.execute(
            `SELECT COUNT(*) as is_registered FROM pendaftaran WHERE workshop_id = ? AND mahasiswa_id = ?`, [id, mhs_id]
        );

        // Form fields
        const [form_fields] = await db.execute(`SELECT * FROM form_fields WHERE workshop_id = ? ORDER BY urutan ASC`, [id]);

        // Sponsors
        const [sponsors] = await db.execute(`SELECT * FROM event_sponsors WHERE event_id = ?`, [id]);

        res.json({ event: events[0], is_registered: is_registered > 0, form_fields, sponsors });
    } catch (error) {
        console.error('Detail Event Error:', error);
        res.status(500).json({ message: 'Gagal memuat detail event' });
    }
});

// Daftar Event (Bisa Multi-Tiket)
router.post('/katalog/:id/daftar', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const event_id = req.params.id;
        const { participants } = req.body; // array of { nama_peserta, email_peserta, telepon_peserta, jenis_kelamin, jawaban_custom }

        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ message: 'Minimal 1 peserta harus didaftarkan.' });
        }

        // Ambil info event
        const [events] = await db.execute(`SELECT * FROM workshops WHERE id = ?`, [event_id]);
        if (events.length === 0) return res.status(404).json({ message: 'Event tidak ditemukan' });
        const event = events[0];

        // Validasi duplikat email di event yang sama
        for (const p of participants) {
            const [[{ is_registered }]] = await db.execute(
                `SELECT COUNT(*) as is_registered FROM pendaftaran WHERE workshop_id = ? AND email_peserta = ? AND status_pembayaran != 'failed'`, 
                [event_id, p.email_peserta]
            );
            if (is_registered > 0) {
                return res.status(400).json({ message: `Email ${p.email_peserta} sudah terdaftar di event ini.` });
            }
        }

        const isFree = event.tipe_event === 'gratis' || event.harga <= 0;
        const group_kode_unik = "WS-" + event_id + "-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        const status_awal = isFree ? 'free' : 'pending';
        
        let paymentUrl = null;

        if (!isFree) {
            const merchantCode = 'D20354';
            const apiKey = 'cc7e768f19d886126b3ef8b1babe81b8';
            const duitkuUrl = 'https://passport.duitku.com/webapi/api/merchant/v2/inquiry';
            
            const paymentAmount = Number(event.harga) * participants.length;
            const merchantOrderId = group_kode_unik;
            const productDetails = 'Tiket: ' + event.judul.substring(0, 50);
            const callbackUrl = 'https://api.ukmelrahma.my.id/api/mahasiswa/callback';
            const returnUrl = 'https://event-bem.vercel.app/mahasiswa/transaksi';
            const expiryPeriod = 60;
            
            const signatureStr = merchantCode + merchantOrderId + paymentAmount + apiKey;
            const signature = crypto.createHash('md5').update(signatureStr).digest('hex');
            
            const payloadData = {
                merchantCode,
                paymentAmount,
                merchantOrderId,
                productDetails,
                additionalParam: '',
                merchantUserInfo: '',
                paymentMethod: 'SQ',
                customerVaName: participants[0].nama_peserta,
                email: participants[0].email_peserta,
                phoneNumber: participants[0].telepon_peserta.replace(/^0/, '62'),
                callbackUrl,
                returnUrl,
                signature,
                expiryPeriod
            };

            const response = await fetch(duitkuUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': JSON.stringify(payloadData).length.toString()
                },
                body: JSON.stringify(payloadData)
            });

            const result = await response.json();
            if (response.ok && result.paymentUrl) {
                paymentUrl = result.paymentUrl;
            } else {
                throw new Error("Duitku Error: " + (result.statusMessage || 'Unknown Error'));
            }
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            for (const p of participants) {
                // Untuk pendaftaran multi-tiket, kita simpan payment_url yang sama untuk semua peserta yang checkout bersamaan
                const [result] = await connection.execute(
                    `INSERT INTO pendaftaran (workshop_id, mahasiswa_id, kode_unik, nama_peserta, email_peserta, telepon_peserta, jenis_kelamin, status_pembayaran, didaftarkan_oleh, payment_url)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'mandiri', ?)`,
                    [event_id, mhs_id, group_kode_unik, p.nama_peserta, p.email_peserta, p.telepon_peserta, p.jenis_kelamin, status_awal, paymentUrl]
                );

                const pendaftaran_id = result.insertId;

                // Insert jawaban custom
                if (p.jawaban_custom && typeof p.jawaban_custom === 'object') {
                    for (const [field_id, value] of Object.entries(p.jawaban_custom)) {
                        await connection.execute(
                            `INSERT INTO pendaftaran_data (pendaftaran_id, field_id, value) VALUES (?, ?, ?)`,
                            [pendaftaran_id, field_id, value]
                        );
                    }
                }
            }

            await connection.commit();

            if (isFree) {
                return res.status(201).json({ message: 'Pendaftaran berhasil' });
            } else {
                return res.status(201).json({ message: 'Pendaftaran berhasil', payment_url: paymentUrl });
            }

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Daftar Event Error:', error);
        res.status(500).json({ message: 'Gagal melakukan pendaftaran' });
    }
});

// ============================================================
// TIKET SAYA
// ============================================================
router.get('/tiket', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const [tikets] = await db.execute(
            `SELECT p.*, w.judul, w.tanggal_waktu, w.lokasi, w.poster, w.jam_selesai
             FROM pendaftaran p JOIN workshops w ON p.workshop_id=w.id 
             WHERE p.mahasiswa_id = ? AND (p.status_pembayaran='paid' OR p.status_pembayaran='free')
             ORDER BY w.tanggal_waktu DESC`, [mhs_id]
        );
        res.json(tikets);
    } catch (error) {
        console.error('Tiket Error:', error);
        res.status(500).json({ message: 'Gagal memuat tiket' });
    }
});

// ============================================================
// RIWAYAT TRANSAKSI
// ============================================================
router.get('/transaksi', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const [transaksi] = await db.execute(
            `SELECT p.*, w.judul, w.tipe_event, w.harga, w.poster, w.tanggal_waktu, w.nominal_denda 
             FROM pendaftaran p JOIN workshops w ON p.workshop_id=w.id 
             WHERE p.mahasiswa_id = ? ORDER BY p.created_at DESC`, [mhs_id]
        );
        res.json(transaksi);
    } catch (error) {
        console.error('Transaksi Error:', error);
        res.status(500).json({ message: 'Gagal memuat riwayat transaksi' });
    }
});

// ============================================================
// E-SERTIFIKAT
// ============================================================
router.get('/sertifikat', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const [sertifikats] = await db.execute(
            `SELECT p.id as pendaftaran_id, p.sertifikat_nomor, 
                    w.id as workshop_id, w.judul, w.tanggal_waktu, w.lokasi, w.sertifikat_template, w.is_kuesioner_active,
                    (SELECT COUNT(*) FROM workshop_answers wa WHERE wa.workshop_id = w.id AND wa.mahasiswa_id = ?) as is_filled
             FROM pendaftaran p JOIN workshops w ON p.workshop_id=w.id 
             WHERE p.mahasiswa_id = ? AND p.status_kehadiran='hadir'
             ORDER BY w.tanggal_waktu DESC`, [mhs_id, mhs_id]
        );
        res.json(sertifikats);
    } catch (error) {
        console.error('Sertifikat Error:', error);
        res.status(500).json({ message: 'Gagal memuat sertifikat' });
    }
});

// ============================================================
// DOWNLOAD E-SERTIFIKAT (GENERATE IMAGE)
// ============================================================
router.get('/sertifikat/:id/download', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const pendaftaran_id = req.params.id;

        const [pendaftaran] = await db.execute(
            `SELECT p.*, w.judul, 
                    w.sertifikat_template, w.sertifikat_font,
                    w.sertifikat_nama_x_percent, w.sertifikat_nama_y_percent, w.sertifikat_nama_fs,
                    w.sertifikat_nomor_x_percent, w.sertifikat_nomor_y_percent, w.sertifikat_nomor_fs,
                    w.sertifikat_prefix, w.sertifikat_nomor_awal, w.is_kuesioner_active,
                    w.sertifikat_custom_fs, w.sertifikat_custom_x_percent, w.sertifikat_custom_y_percent,
                    w.sertifikat_custom_type, w.sertifikat_custom_global_text,
                    (SELECT COUNT(*) FROM workshop_answers wa WHERE wa.workshop_id = w.id AND wa.mahasiswa_id = ?) as is_filled
             FROM pendaftaran p 
             JOIN workshops w ON p.workshop_id = w.id 
             WHERE p.id = ? AND p.mahasiswa_id = ?`,
            [mhs_id, pendaftaran_id, mhs_id]
        );

        if (pendaftaran.length === 0) {
            return res.status(404).json({ message: 'Sertifikat tidak ditemukan atau bukan milik Anda' });
        }

        const data = pendaftaran[0];

        if (data.status_kehadiran !== 'hadir') {
            return res.status(403).json({ message: 'Sertifikat hanya diberikan kepada peserta yang hadir' });
        }

        if (data.is_kuesioner_active == 1 && data.is_filled == 0) {
            return res.status(403).json({ message: 'Harap isi kuesioner terlebih dahulu' });
        }

        if (!data.sertifikat_template) {
            return res.status(404).json({ message: 'Template sertifikat belum diatur' });
        }

        // Generate Nomor
        let nomor_sertifikat = data.sertifikat_nomor;
        if (!nomor_sertifikat) {
            const [[{ count }]] = await db.execute(
                `SELECT COUNT(*) as count FROM pendaftaran WHERE workshop_id = ? AND sertifikat_nomor IS NOT NULL`,
                [data.workshop_id]
            );
            const start_num = data.sertifikat_nomor_awal || 1;
            const nomor_urut = count + start_num;
            
            const prefix = data.sertifikat_prefix ? '/' + data.sertifikat_prefix : '';
            nomor_sertifikat = String(nomor_urut).padStart(3, '0') + prefix;

            await db.execute(
                `UPDATE pendaftaran SET sertifikat_nomor = ?, sertifikat_status = 'terkirim' WHERE id = ?`,
                [nomor_sertifikat, pendaftaran_id]
            );
            data.sertifikat_nomor = nomor_sertifikat;
        }

        // Generate Image with canvas
        const { createCanvas, loadImage } = require('canvas');
        
        let templatePath = data.sertifikat_template;
        if (templatePath.startsWith('/')) templatePath = templatePath.substring(1);
        
        const absolutePath = path.join(__dirname, '..', templatePath);
        
        if (!require('fs').existsSync(absolutePath)) {
            return res.status(404).json({ message: 'File template gambar tidak ditemukan di server.' });
        }

        const image = await loadImage(absolutePath);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(image, 0, 0, image.width, image.height);
        ctx.fillStyle = '#1e1e1e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw Name
        const fsNama = data.sertifikat_nama_fs || 60;
        ctx.font = `bold ${fsNama}px sans-serif`;
        const xNama = (data.sertifikat_nama_x_percent / 100) * image.width;
        const yNama = (data.sertifikat_nama_y_percent / 100) * image.height;
        ctx.fillText(data.nama_peserta, xNama, yNama);

        // Draw Nomor
        const fsNomor = data.sertifikat_nomor_fs || 30;
        ctx.font = `bold ${fsNomor}px sans-serif`;
        const xNomor = (data.sertifikat_nomor_x_percent / 100) * image.width;
        const yNomor = (data.sertifikat_nomor_y_percent / 100) * image.height;
        ctx.fillText("No: " + data.sertifikat_nomor, xNomor, yNomor);

        // Draw Custom Text
        if (data.sertifikat_custom_type !== 'none') {
            let customText = "";
            if (data.sertifikat_custom_type === 'global') {
                customText = data.sertifikat_custom_global_text || "";
            } else if (data.sertifikat_custom_type === 'per_peserta') {
                customText = data.sertifikat_predikat || "";
            }

            if (customText.trim() !== "") {
                const fsCustom = data.sertifikat_custom_fs || 30;
                ctx.font = `bold ${fsCustom}px sans-serif`;
                const xCustom = (data.sertifikat_custom_x_percent / 100) * image.width;
                const yCustom = (data.sertifikat_custom_y_percent / 100) * image.height;
                ctx.fillText(customText, xCustom, yCustom);
            }
        }

        const buffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });
        
        const filename = `Sertifikat-${data.nama_peserta.replace(/[^A-Za-z0-9]/g, '_')}.jpg`;
        
        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);

    } catch (error) {
        console.error('Download Sertifikat Error:', error);
        res.status(500).json({ message: 'Gagal mengunduh sertifikat' });
    }
});

// ============================================================
// KUESIONER
// ============================================================
// GET: Ambil pertanyaan kuesioner
router.get('/kuesioner/:workshop_id', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const { workshop_id } = req.params;

        // Cek apakah sudah hadir
        const [pendaftaran] = await db.execute(
            `SELECT id FROM pendaftaran WHERE workshop_id = ? AND mahasiswa_id = ? AND status_kehadiran = 'hadir'`,
            [workshop_id, mhs_id]
        );
        if (pendaftaran.length === 0) return res.status(403).json({ message: 'Anda belum tercatat hadir di event ini.' });

        // Cek apakah sudah isi
        const [[{ already_filled }]] = await db.execute(
            `SELECT COUNT(*) as already_filled FROM workshop_answers WHERE workshop_id = ? AND mahasiswa_id = ?`,
            [workshop_id, mhs_id]
        );

        const [questions] = await db.execute(
            `SELECT * FROM workshop_questions WHERE workshop_id = ? ORDER BY id ASC`, [workshop_id]
        );

        const [workshop] = await db.execute(`SELECT judul FROM workshops WHERE id = ?`, [workshop_id]);

        res.json({ questions, already_filled: already_filled > 0, event_title: workshop[0]?.judul || '' });
    } catch (error) {
        console.error('Kuesioner Error:', error);
        res.status(500).json({ message: 'Gagal memuat kuesioner' });
    }
});

// POST: Kirim jawaban kuesioner
router.post('/kuesioner/:workshop_id', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const { workshop_id } = req.params;
        const { answers } = req.body; // Array of { question_id, answer_text }

        if (!answers || !Array.isArray(answers) || answers.length === 0) {
            return res.status(400).json({ message: 'Jawaban tidak boleh kosong' });
        }

        // Cek apakah sudah isi
        const [[{ already_filled }]] = await db.execute(
            `SELECT COUNT(*) as already_filled FROM workshop_answers WHERE workshop_id = ? AND mahasiswa_id = ?`,
            [workshop_id, mhs_id]
        );
        if (already_filled > 0) return res.status(400).json({ message: 'Anda sudah mengisi kuesioner ini.' });

        // Insert answers
        for (const ans of answers) {
            await db.execute(
                `INSERT INTO workshop_answers (workshop_id, mahasiswa_id, question_id, answer_text) VALUES (?, ?, ?, ?)`,
                [workshop_id, mhs_id, ans.question_id, ans.answer_text || '']
            );
        }

        res.json({ message: 'Kuesioner berhasil disubmit! Terima kasih.' });
    } catch (error) {
        console.error('Submit Kuesioner Error:', error);
        res.status(500).json({ message: 'Gagal mengirim jawaban kuesioner' });
    }
});

// ============================================================
// PROFIL
// ============================================================
router.get('/profil', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, nim, nama_lengkap, email, jenis_kelamin, prodi, no_hp_mahasiswa, foto_mahasiswa, created_at FROM mahasiswa WHERE id = ?`,
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Profil tidak ditemukan' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Gagal memuat profil' });
    }
});

router.put('/profil', authenticateToken, isMahasiswa, upload.single('foto_mahasiswa'), async (req, res) => {
    try {
        console.log("UPDATE PROFIL - BODY:", req.body);
        console.log("UPDATE PROFIL - FILE:", req.file);

        const mhs_id = req.user.id;
        const { nim, nama_lengkap, no_hp_mahasiswa, jenis_kelamin, prodi, password_baru, konfirmasi_password } = req.body;

        if (!nama_lengkap) return res.status(400).json({ message: 'Nama lengkap wajib diisi' });

        if (nim) {
            const [checkNim] = await db.execute(
                'SELECT id FROM mahasiswa WHERE nim = ? AND id != ?',
                [nim, mhs_id]
            );
            if (checkNim.length > 0) {
                return res.status(400).json({ message: 'NIM sudah digunakan oleh pengguna lain' });
            }
        }

        let sql = `UPDATE mahasiswa SET nim=?, nama_lengkap=?, no_hp_mahasiswa=?, jenis_kelamin=?, prodi=?`;
        const params = [nim || null, nama_lengkap, no_hp_mahasiswa || null, jenis_kelamin || null, prodi || null];

        // Handle foto
        if (req.file) {
            sql += `, foto_mahasiswa=?`;
            params.push(req.file.filename);
        }

        // Handle password
        if (password_baru) {
            if (password_baru !== konfirmasi_password) {
                return res.status(400).json({ message: 'Konfirmasi password tidak cocok' });
            }
            if (password_baru.length < 8) {
                return res.status(400).json({ message: 'Password minimal 8 karakter' });
            }
            const hashed = await bcrypt.hash(password_baru, 10);
            sql += `, password=?`;
            params.push(hashed);
        }

        sql += ` WHERE id=?`;
        params.push(mhs_id);

        await db.execute(sql, params);
        const [updatedRows] = await db.execute('SELECT foto_mahasiswa FROM mahasiswa WHERE id = ?', [mhs_id]);
        res.json({ 
            message: 'Profil berhasil diperbarui!',
            foto_mahasiswa: updatedRows[0]?.foto_mahasiswa 
        });
    } catch (error) {
        console.error('Update Profil Error:', error);
        res.status(500).json({ message: 'Gagal memperbarui profil' });
    }
});

// ============================================================
// DISKUSI (Chat)
// ============================================================
router.get('/diskusi/:workshop_id', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const { workshop_id } = req.params;
        const [messages] = await db.execute(
            `SELECT d.*, 
                    CASE WHEN d.user_type='mahasiswa' THEN (SELECT nama_lengkap FROM mahasiswa WHERE id=d.user_id)
                         ELSE (SELECT nama_lengkap FROM users WHERE id=d.user_id) END as nama_pengirim
             FROM workshop_discussions d 
             WHERE d.workshop_id = ? ORDER BY d.created_at ASC`, [workshop_id]
        );
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Gagal memuat diskusi' });
    }
});

router.post('/diskusi/:workshop_id', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const { workshop_id } = req.params;
        const { message } = req.body;

        if (!message || !message.trim()) return res.status(400).json({ message: 'Pesan tidak boleh kosong' });

        await db.execute(
            `INSERT INTO workshop_discussions (workshop_id, user_id, user_type, message) VALUES (?, ?, 'mahasiswa', ?)`,
            [workshop_id, mhs_id, message.trim()]
        );
        res.status(201).json({ message: 'Pesan terkirim!' });
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengirim pesan' });
    }
});

// Get Materials for Workshop (Mahasiswa view)
router.get('/materials/:workshop_id', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const { workshop_id } = req.params;
        
        // Verify if student is registered for the event
        const [[{ is_registered }]] = await db.execute(
            'SELECT COUNT(*) as is_registered FROM pendaftaran WHERE workshop_id = ? AND mahasiswa_id = ? AND status_pembayaran != \'failed\'', 
            [workshop_id, req.user.id]
        );
        
        if (is_registered === 0) {
            return res.status(403).json({ message: 'Akses ditolak! Anda belum terdaftar di event ini.' });
        }

        const [rows] = await db.execute(
            'SELECT * FROM workshop_materials WHERE workshop_id = ? ORDER BY uploaded_at DESC', [workshop_id]
        );
        res.json(rows);
    } catch (error) {
        console.error('Mahasiswa Get Materials Error:', error);
        res.status(500).json({ message: 'Gagal mengambil materi' });
    }
});

// ============================================================
// PANITIA EVENT (Kelola Pendaftar)
// ============================================================

// [1] GET Daftar Event Kepanitiaan (Sembunyikan jika > 7 hari)
router.get('/panitia-events', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const [events] = await db.execute(`
            SELECT w.*, ec.role,
                   (SELECT COUNT(*) FROM pendaftaran p WHERE p.workshop_id = w.id) as jumlah_pendaftar,
                   (SELECT COUNT(*) FROM pendaftaran p WHERE p.workshop_id = w.id AND p.status_kehadiran = 'hadir') as jumlah_hadir
            FROM event_committees ec
            JOIN workshops w ON ec.event_id = w.id
            WHERE ec.mahasiswa_id = ? AND DATEDIFF(NOW(), w.tanggal_waktu) <= 7
            ORDER BY w.tanggal_waktu DESC
        `, [mhs_id]);
        res.json(events);
    } catch (error) {
        console.error('Error fetching panitia events:', error);
        res.status(500).json({ message: 'Gagal memuat event kepanitiaan' });
    }
});

// [2] GET Pendaftar per Event Kepanitiaan
router.get('/panitia-events/:event_id/pendaftar', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const { event_id } = req.params;

        // Validasi panitia
        const [check] = await db.execute('SELECT id FROM event_committees WHERE event_id = ? AND mahasiswa_id = ?', [event_id, mhs_id]);
        if (check.length === 0) return res.status(403).json({ message: 'Anda bukan panitia di event ini' });

        const [pendaftar] = await db.execute(`
            SELECT p.*, m.nim, m.prodi 
            FROM pendaftaran p
            LEFT JOIN mahasiswa m ON p.mahasiswa_id = m.id
            WHERE p.workshop_id = ?
            ORDER BY p.created_at DESC
        `, [event_id]);
        res.json(pendaftar);
    } catch (error) {
        res.status(500).json({ message: 'Gagal memuat pendaftar' });
    }
});

// [3] POST Scan Check-in
router.post('/panitia-events/:event_id/scan', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const { event_id } = req.params;
        const { kode_unik } = req.body;

        // Validasi panitia
        const [check] = await db.execute('SELECT id FROM event_committees WHERE event_id = ? AND mahasiswa_id = ?', [event_id, mhs_id]);
        if (check.length === 0) return res.status(403).json({ message: 'Anda bukan panitia di event ini' });

        if (!kode_unik) return res.status(400).json({ message: 'Kode unik tidak boleh kosong' });

        const [pendaftar] = await db.execute('SELECT * FROM pendaftaran WHERE workshop_id = ? AND kode_unik = ?', [event_id, kode_unik]);
        if (pendaftar.length === 0) return res.status(404).json({ message: 'Peserta tidak ditemukan untuk event ini' });

        const data = pendaftar[0];
        if (data.status_kehadiran === 'hadir') return res.status(400).json({ message: 'Peserta sudah check-in sebelumnya!', peserta: data });

        await db.execute('UPDATE pendaftaran SET status_kehadiran = "hadir", check_in_at = NOW() WHERE id = ?', [data.id]);
        res.json({ message: 'Check-in berhasil!', peserta: data });
    } catch (error) {
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [4] DELETE Hapus Peserta
router.delete('/panitia-events/:event_id/pendaftar/:id', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const { event_id, id } = req.params;

        // Validasi panitia
        const [check] = await db.execute('SELECT id FROM event_committees WHERE event_id = ? AND mahasiswa_id = ?', [event_id, mhs_id]);
        if (check.length === 0) return res.status(403).json({ message: 'Akses ditolak' });

        await db.execute('DELETE FROM pendaftaran WHERE id = ? AND workshop_id = ?', [id, event_id]);
        res.json({ message: 'Peserta berhasil dihapus' });
    } catch (error) {
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [5] PUT Update Status Pembayaran / Kehadiran (opsional/manual)
router.put('/panitia-events/:event_id/pendaftar/:id/status', authenticateToken, isMahasiswa, async (req, res) => {
    try {
        const mhs_id = req.user.id;
        const { event_id, id } = req.params;
        const { status_pembayaran, status_kehadiran } = req.body;

        const [check] = await db.execute('SELECT id FROM event_committees WHERE event_id = ? AND mahasiswa_id = ?', [event_id, mhs_id]);
        if (check.length === 0) return res.status(403).json({ message: 'Akses ditolak' });

        let sql = 'UPDATE pendaftaran SET ';
        let params = [];
        if (status_pembayaran) {
            sql += 'status_pembayaran = ?, ';
            params.push(status_pembayaran);
        }
        if (status_kehadiran) {
            sql += 'status_kehadiran = ?, ';
            params.push(status_kehadiran);
        }
        
        if (params.length === 0) return res.status(400).json({ message: 'Tidak ada data untuk diupdate' });
        
        sql = sql.slice(0, -2) + ' WHERE id = ? AND workshop_id = ?';
        params.push(id, event_id);

        await db.execute(sql, params);
        res.json({ message: 'Status peserta berhasil diupdate' });
    } catch (error) {
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

// ============================================================
// CALLBACK DUITKU
// ============================================================
router.post('/callback', async (req, res) => {
    try {
        const { merchantCode, amount, merchantOrderId, signature, reference, resultCode } = req.body;
        
        // Dalam produksi, sebaiknya ambil apiKey dari .env
        const apiKey = 'cc7e768f19d886126b3ef8b1babe81b8';
        const expectedMerchantCode = 'D20354';

        if (!merchantCode || !amount || !merchantOrderId || !signature) {
            return res.status(400).send('Bad Request: Missing required parameters');
        }

        // Validasi signature
        const signatureStr = expectedMerchantCode + amount + merchantOrderId + apiKey;
        const expectedSignature = crypto.createHash('md5').update(signatureStr).digest('hex');

        if (signature !== expectedSignature) {
            console.error('Duitku Callback Error: Invalid Signature', { received: signature, expected: expectedSignature });
            return res.status(400).send('Bad Request: Invalid Signature');
        }

        let paymentStatus = 'pending';
        if (resultCode === '00') {
            paymentStatus = 'paid';
        } else if (resultCode === '01') {
            paymentStatus = 'pending';
        } else if (resultCode === '02') {
            paymentStatus = 'failed';
        }

        console.log(`Duitku Callback Received: OrderID ${merchantOrderId}, Status ${paymentStatus}`);

        // Update database
        await db.execute(
            `UPDATE pendaftaran SET status_pembayaran = ? WHERE kode_unik = ?`,
            [paymentStatus, merchantOrderId]
        );

        res.status(200).send('SUCCESS');
    } catch (error) {
        console.error('Duitku Callback Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
