# Backend - Sistem Manajemen Event BEM

Backend REST API untuk sistem manajemen event dan workshop mahasiswa berbasis Express.js dan MySQL.

## 🚀 Fitur Utama
- **Autentikasi & Otorisasi:** JWT token untuk Superadmin, Penyelenggara (BEM/HIMA/UKM), dan Mahasiswa (termasuk Google OAuth).
- **Manajemen Event:** CRUD event, upload poster, manajemen kuota, tiket gratis & berbayar.
- **Pendaftaran & Formulir Dinamis:** Custom field pendaftaran per-event.
- **Sertifikat Digital:** Generator sertifikat kustom menggunakan Node Canvas.
- **Kuesioner / Feedback:** Pertanyaan dinamis dan pengumpulan jawaban peserta.
- **Diskusi Event:** Forum diskusi interaktif per-event antara penyelenggara dan mahasiswa.
- **Kepanitiaan & Sponsor:** Manajemen tim panitia event dan logo sponsor.

---

## 🛠️ Persyaratan Sistem
- Node.js (v18 atau lebih baru)
- MySQL / MariaDB (e.g., Laragon / XAMPP)

---

## 📦 Panduan Instalasi

1. **Clone repository & masuk ke direktori:**
   ```bash
   cd Backend-Event
   ```

2. **Install dependensi:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment Variables:**
   Salin file `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
   Sesuaikan konfigurasi database dan kredensial di dalam file `.env`.

4. **Impor Database:**
   Buat database baru di MySQL (misal: `event-mahasiswa`), lalu impor file:
   ```bash
   mysql -u root -p event-mahasiswa < database.sql
   ```

5. **Jalankan Server:**
   - Mode Development:
     ```bash
     npm run dev
     ```
   - Mode Production:
     ```bash
     npm start
     ```
   Server akan berjalan secara default di `http://localhost:5000`.

---

## 📁 Struktur Direktori
```text
Backend-Event/
├── config/             # Konfigurasi database MySQL
├── middleware/         # Middleware autentikasi JWT & Role guard
├── routes/             # Controller & endpoint modular API
├── uploads/            # Direktori file upload (poster, sertifikat, materi)
├── .env.example        # Contoh environment variables
├── .gitignore          # Konfigurasi file yang diabaikan git
├── database.sql        # Skema database MySQL terbaru
├── package.json        # Dependensi dan scripts
├── README.md           # Dokumentasi API Backend
└── server.js           # Entry point aplikasi Express
```
