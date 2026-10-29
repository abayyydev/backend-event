const express = require('express');
const db = require('../config/database');
const { authenticateToken, isPenyelenggara } = require('../middleware/auth');

const router = express.Router();

// [1] GET Daftar Event & Statistik Pendaftar
router.get('/', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const penyelenggara_id = req.user.owner_id || req.user.id;

        const [events] = await db.execute(`
            SELECT w.*, 
                   (SELECT COUNT(*) FROM pendaftaran p WHERE p.workshop_id = w.id) as jumlah_pendaftar,
                   (SELECT COUNT(*) FROM pendaftaran p WHERE p.workshop_id = w.id AND p.status_kehadiran = 'hadir') as jumlah_hadir
            FROM workshops w 
            WHERE w.penyelenggara_id = ?
            ORDER BY w.tanggal_waktu DESC
        `, [penyelenggara_id]);

        res.json(events);
    } catch (error) {
        console.error('Error fetching event stats:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [2] GET Detail Pendaftar per Event
router.get('/:event_id', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const penyelenggara_id = req.user.owner_id || req.user.id;
        const { event_id } = req.params;

        // Validasi kepemilikan event
        const [events] = await db.execute('SELECT id FROM workshops WHERE id = ? AND penyelenggara_id = ?', [event_id, penyelenggara_id]);
        if (events.length === 0) {
            return res.status(403).json({ message: 'Anda tidak memiliki akses ke event ini' });
        }

        const [pendaftar] = await db.execute(`
            SELECT p.*, m.nim, m.prodi 
            FROM pendaftaran p
            LEFT JOIN mahasiswa m ON p.mahasiswa_id = m.id
            WHERE p.workshop_id = ?
            ORDER BY p.created_at DESC
        `, [event_id]);

        res.json(pendaftar);
    } catch (error) {
        console.error('Error fetching pendaftar detail:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [3] POST Scan Check-in
router.post('/:event_id/scan', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const penyelenggara_id = req.user.owner_id || req.user.id;
        const { event_id } = req.params;
        const { kode_unik } = req.body;

        if (!kode_unik) {
            return res.status(400).json({ message: 'Kode unik tidak boleh kosong' });
        }

        // Validasi kepemilikan event
        const [events] = await db.execute('SELECT id FROM workshops WHERE id = ? AND penyelenggara_id = ?', [event_id, penyelenggara_id]);
        if (events.length === 0) {
            return res.status(403).json({ message: 'Anda tidak memiliki akses ke event ini' });
        }

        // Cari pendaftaran
        const [pendaftar] = await db.execute('SELECT * FROM pendaftaran WHERE workshop_id = ? AND kode_unik = ?', [event_id, kode_unik]);
        if (pendaftar.length === 0) {
            return res.status(404).json({ message: 'Peserta tidak ditemukan untuk event ini' });
        }

        const data = pendaftar[0];
        
        if (data.status_kehadiran === 'hadir') {
            return res.status(400).json({ 
                message: 'Peserta sudah check-in sebelumnya!',
                peserta: data
            });
        }

        // Update status_kehadiran
        await db.execute('UPDATE pendaftaran SET status_kehadiran = "hadir", check_in_at = NOW() WHERE id = ?', [data.id]);

        res.json({
            message: 'Check-in berhasil!',
            peserta: data
        });

    } catch (error) {
        console.error('Error scanning checkin:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [4] GET Keuangan & Pemasukan per Event
router.get('/:event_id/keuangan', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const penyelenggara_id = req.user.owner_id || req.user.id;
        const { event_id } = req.params;

        // Validasi kepemilikan event dan dapatkan detail harga/denda
        const [events] = await db.execute(
            'SELECT id, judul, tipe_event, harga, nominal_denda FROM workshops WHERE id = ? AND penyelenggara_id = ?', 
            [event_id, penyelenggara_id]
        );
        if (events.length === 0) {
            return res.status(403).json({ message: 'Anda tidak memiliki akses ke event ini' });
        }
        const workshop = events[0];

        // Ambil semua pendaftar (selain status pembayaran 'failed')
        const [pendaftar] = await db.execute(`
            SELECT p.id, p.nama_peserta, p.email_peserta, p.telepon_peserta, p.status_pembayaran, p.status_denda, p.created_at, m.nim
            FROM pendaftaran p
            LEFT JOIN mahasiswa m ON p.mahasiswa_id = m.id
            WHERE p.workshop_id = ? AND p.status_pembayaran != 'failed'
            ORDER BY p.created_at DESC
        `, [event_id]);

        let total_pendaftaran_lunas = 0;
        let total_pendaftaran_belum_lunas = 0;
        let total_denda_lunas = 0;
        let total_denda_belum_lunas = 0;

        const records = [];

        for (const p of pendaftar) {
            const isPaidReg = (p.status_pembayaran === 'paid' || p.status_pembayaran === 'free');
            const nominalReg = workshop.tipe_event === 'gratis' ? 0 : Number(workshop.harga);

            // Transaksi Registrasi
            if (nominalReg > 0) {
                if (isPaidReg) {
                    total_pendaftaran_lunas += nominalReg;
                } else {
                    total_pendaftaran_belum_lunas += nominalReg;
                }

                records.push({
                    id: `reg-${p.id}`,
                    nama_peserta: p.nama_peserta,
                    nim: p.nim || '-',
                    email: p.email_peserta,
                    tipe: 'pendaftaran',
                    keterangan: 'Biaya Registrasi',
                    nominal: nominalReg,
                    status: isPaidReg ? 'lunas' : 'belum_lunas',
                    tanggal: p.created_at
                });
            }

            // Transaksi Denda (jika kena denda atau denda sudah lunas)
            if (p.status_denda === 'kena_denda' || p.status_denda === 'lunas') {
                const nominalDenda = Number(workshop.nominal_denda);
                const isPaidDenda = p.status_denda === 'lunas';

                if (nominalDenda > 0) {
                    if (isPaidDenda) {
                        total_denda_lunas += nominalDenda;
                    } else {
                        total_denda_belum_lunas += nominalDenda;
                    }

                    records.push({
                        id: `denda-${p.id}`,
                        nama_peserta: p.nama_peserta,
                        nim: p.nim || '-',
                        email: p.email_peserta,
                        tipe: 'denda',
                        keterangan: 'Denda Ketidakhadiran/Pelanggaran',
                        nominal: nominalDenda,
                        status: isPaidDenda ? 'lunas' : 'belum_lunas',
                        tanggal: p.created_at
                    });
                }
            }
        }

        res.json({
            workshop: workshop,
            stats: {
                total_pendaftaran_lunas: total_pendaftaran_lunas,
                total_pendaftaran_belum_lunas: total_pendaftaran_belum_lunas,
                total_denda_lunas: total_denda_lunas,
                total_denda_belum_lunas: total_denda_belum_lunas,
                total_pemasukan_lunas: total_pendaftaran_lunas + total_denda_lunas,
                total_pemasukan_belum_lunas: total_pendaftaran_belum_lunas + total_denda_belum_lunas,
                grand_total: total_pendaftaran_lunas + total_denda_lunas + total_pendaftaran_belum_lunas + total_denda_belum_lunas
            },
            records: records
        });

    } catch (error) {
        console.error('Error fetching keuangan:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [5] PUT Update Predikat Sertifikat
router.put('/:event_id/pendaftar/:pendaftar_id/predikat', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const penyelenggara_id = req.user.owner_id || req.user.id;
        const { event_id, pendaftar_id } = req.params;
        const { predikat } = req.body;

        // Validasi kepemilikan event
        const [events] = await db.execute('SELECT id FROM workshops WHERE id = ? AND penyelenggara_id = ?', [event_id, penyelenggara_id]);
        if (events.length === 0) {
            return res.status(403).json({ message: 'Anda tidak memiliki akses ke event ini' });
        }

        await db.execute('UPDATE pendaftaran SET sertifikat_predikat = ? WHERE id = ? AND workshop_id = ?', [predikat || null, pendaftar_id, event_id]);
        res.json({ message: 'Predikat berhasil disimpan' });
    } catch (error) {
        console.error('Error updating predikat:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

// [6] DELETE Hapus Peserta
router.delete('/:id', authenticateToken, isPenyelenggara, async (req, res) => {
    try {
        const penyelenggara_id = req.user.owner_id || req.user.id;
        const { id } = req.params;

        // Validasi: Pastikan pendaftaran ini milik event yang dikelola oleh penyelenggara ini
        const [pendaftar] = await db.execute(`
            SELECT p.id 
            FROM pendaftaran p
            JOIN workshops w ON p.workshop_id = w.id
            WHERE p.id = ? AND w.penyelenggara_id = ?
        `, [id, penyelenggara_id]);

        if (pendaftar.length === 0) {
            return res.status(403).json({ message: 'Akses ditolak atau data tidak ditemukan' });
        }

        // Hapus data
        await db.execute('DELETE FROM pendaftaran WHERE id = ?', [id]);

        res.json({ message: 'Peserta berhasil dihapus' });
    } catch (error) {
        console.error('Error deleting participant:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;
