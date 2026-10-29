const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

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

// [U]PDATE: Toggle status kuesioner event
router.put('/:workshop_id/toggle', authenticateToken, checkEventOwnership, async (req, res) => {
    try {
        const { workshop_id } = req.params;
        const { is_active } = req.body;
        
        await db.execute(
            `UPDATE workshops SET is_kuesioner_active=? WHERE id=?`,
            [is_active ? 1 : 0, workshop_id]
        );
        res.json({ message: 'Status kuesioner diperbarui!' });
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengubah status kuesioner' });
    }
});

// [R]EAD: Ambil semua pertanyaan kuesioner
router.get('/:workshop_id', authenticateToken, checkEventOwnership, async (req, res) => {
    try {
        const { workshop_id } = req.params;
        const [questions] = await db.execute(
            `SELECT * FROM workshop_questions WHERE workshop_id = ? ORDER BY id ASC`,
            [workshop_id]
        );
        res.json(questions);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data kuesioner' });
    }
});

// [C]REATE: Tambah pertanyaan kuesioner
router.post('/:workshop_id', authenticateToken, checkEventOwnership, async (req, res) => {
    try {
        const { workshop_id } = req.params;
        const { question_text, question_type, options } = req.body;
        
        await db.execute(
            `INSERT INTO workshop_questions (workshop_id, question_text, question_type, options) 
             VALUES (?, ?, ?, ?)`,
            [workshop_id, question_text, question_type, options || null]
        );
        res.status(201).json({ message: 'Pertanyaan berhasil ditambahkan!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal menyimpan pertanyaan' });
    }
});

// [D]ELETE: Hapus pertanyaan kuesioner
router.delete('/:id', authenticateToken, async (req, res) => {
    if (req.user.role === 'mahasiswa') return res.status(403).json({ message: 'Akses ditolak!' });

    try {
        const { id } = req.params;
        
        const [questions] = await db.execute('SELECT workshop_id FROM workshop_questions WHERE id = ?', [id]);
        if (questions.length === 0) return res.status(404).json({ message: 'Pertanyaan tidak ditemukan' });
        
        const workshop_id = questions[0].workshop_id;
        const [workshops] = await db.execute('SELECT penyelenggara_id FROM workshops WHERE id = ?', [workshop_id]);
        
        if (req.user.role !== 'superadmin' && workshops[0].penyelenggara_id !== req.user.id) {
            return res.status(403).json({ message: 'Akses ditolak!' });
        }

        await db.execute('DELETE FROM workshop_questions WHERE id = ?', [id]);
        res.json({ message: 'Pertanyaan berhasil dihapus!' });
    } catch (error) {
        res.status(500).json({ message: 'Gagal menghapus pertanyaan' });
    }
});

// [R]EAD HASIL: Ambil hasil jawaban kuesioner dari tabel workshop_answers
router.get('/:workshop_id/hasil', authenticateToken, checkEventOwnership, async (req, res) => {
    try {
        const { workshop_id } = req.params;
        // Ambil summary atau semua row, tergantung kebutuhan frontend.
        // Kita join dengan tabel user (mahasiswa)
        const [answers] = await db.execute(
            `SELECT a.*, q.question_text, q.question_type, m.nama_lengkap as participant_name 
             FROM workshop_answers a 
             JOIN workshop_questions q ON a.question_id = q.id 
             JOIN mahasiswa m ON a.mahasiswa_id = m.id
             WHERE q.workshop_id = ?
             ORDER BY a.created_at DESC`,
            [workshop_id]
        );
        
        // Group by participant (mahasiswa_id) untuk mempermudah display
        const grouped = answers.reduce((acc, curr) => {
            if (!acc[curr.mahasiswa_id]) {
                acc[curr.mahasiswa_id] = {
                    participant_name: curr.participant_name,
                    date: curr.created_at,
                    answers: []
                };
            }
            acc[curr.mahasiswa_id].answers.push({
                question: curr.question_text,
                type: curr.question_type,
                answer: curr.answer_text,
                rating: curr.rating_value
            });
            return acc;
        }, {});

        res.json(Object.values(grouped));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal mengambil hasil kuesioner' });
    }
});

module.exports = router;
