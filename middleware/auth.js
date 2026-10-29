const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_super_kampus_event_2026';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Akses ditolak! Token tidak ditemukan.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token tidak valid atau sudah kadaluarsa.' });
        
        req.user = user; 
        next();
    });
};

const isSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Akses ditolak! Hanya Superadmin yang diizinkan.' });
    }
    next();
};

const isPenyelenggara = (req, res, next) => {
    if (req.user.role !== 'superadmin' && req.user.role !== 'penyelenggara') {
        return res.status(403).json({ message: 'Akses ditolak! Hanya Penyelenggara yang diizinkan.' });
    }
    next();
};

const isMahasiswa = (req, res, next) => {
    // Both mahasiswa and users might access student routes depending on business logic,
    // but typically only mahasiswa can register for events as participants.
    if (req.user.role !== 'mahasiswa') {
        return res.status(403).json({ message: 'Akses ditolak! Hanya Mahasiswa yang diizinkan.' });
    }
    next();
};

module.exports = {
    authenticateToken,
    isSuperAdmin,
    isPenyelenggara,
    isMahasiswa
};