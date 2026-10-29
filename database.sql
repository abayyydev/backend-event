-- MySQL dump 10.13  Distrib 8.0.30, for Win64 (x86_64)
--
-- Host: localhost    Database: event-mahasiswa
-- ------------------------------------------------------
-- Server version	8.0.30

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `event_addons`
--

DROP TABLE IF EXISTS `event_addons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_addons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workshop_id` int NOT NULL,
  `nama_barang` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `deskripsi` text COLLATE utf8mb4_unicode_ci,
  `harga` int NOT NULL DEFAULT '0',
  `stok` int NOT NULL DEFAULT '0',
  `gambar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `workshop_id` (`workshop_id`),
  CONSTRAINT `event_addons_ibfk_1` FOREIGN KEY (`workshop_id`) REFERENCES `workshops` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `event_committees`
--

DROP TABLE IF EXISTS `event_committees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_committees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `mahasiswa_id` int NOT NULL,
  `role` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `event_id` (`event_id`),
  KEY `mahasiswa_id` (`mahasiswa_id`),
  CONSTRAINT `event_committees_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `workshops` (`id`) ON DELETE CASCADE,
  CONSTRAINT `event_committees_ibfk_2` FOREIGN KEY (`mahasiswa_id`) REFERENCES `mahasiswa` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `event_sponsors`
--

DROP TABLE IF EXISTS `event_sponsors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_sponsors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `nama_sponsor` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `event_id` (`event_id`),
  CONSTRAINT `event_sponsors_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `workshops` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `form_fields`
--

DROP TABLE IF EXISTS `form_fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `form_fields` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workshop_id` int NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `field_type` enum('text','email','tel','select','radio','textarea') COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` text COLLATE utf8mb4_unicode_ci,
  `is_required` tinyint(1) NOT NULL DEFAULT '1',
  `placeholder` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `urutan` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `workshop_id` (`workshop_id`),
  CONSTRAINT `form_fields_ibfk_1` FOREIGN KEY (`workshop_id`) REFERENCES `workshops` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mahasiswa`
--

DROP TABLE IF EXISTS `mahasiswa`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mahasiswa` (
  `id` int NOT NULL AUTO_INCREMENT,
  `google_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nim` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `otp_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `otp_expires_at` datetime DEFAULT NULL,
  `nama_lengkap` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `jenis_kelamin` enum('Laki-laki','Perempuan') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prodi` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `no_hp_mahasiswa` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_mahasiswa` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `google_id` (`google_id`),
  UNIQUE KEY `nim` (`nim`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pendaftaran`
--

DROP TABLE IF EXISTS `pendaftaran`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pendaftaran` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workshop_id` int NOT NULL,
  `mahasiswa_id` int DEFAULT NULL,
  `nama_peserta` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `jenis_kelamin` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_peserta` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telepon_peserta` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kode_unik` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qr_source` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_accessed_at` timestamp NULL DEFAULT NULL,
  `status_pembayaran` enum('pending','paid','failed','free') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `status_kehadiran` enum('absen','hadir') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'absen',
  `sertifikat_status` enum('belum_dikirim','terkirim') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'belum_dikirim',
  `sertifikat_nomor` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `payment_url` text COLLATE utf8mb4_unicode_ci,
  `payment_expiry` datetime DEFAULT NULL,
  `check_in_at` datetime DEFAULT NULL,
  `check_out_at` datetime DEFAULT NULL,
  `status_denda` enum('aman','kena_denda','lunas') COLLATE utf8mb4_unicode_ci DEFAULT 'aman',
  `didaftarkan_oleh` enum('admin','user','mandiri') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'admin',
  `sertifikat_predikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `kode_unik` (`kode_unik`),
  KEY `idx_mahasiswa` (`mahasiswa_id`),
  CONSTRAINT `pendaftaran_mahasiswa_fk` FOREIGN KEY (`mahasiswa_id`) REFERENCES `mahasiswa` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pendaftaran_data`
--

DROP TABLE IF EXISTS `pendaftaran_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pendaftaran_data` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pendaftaran_id` int NOT NULL,
  `field_id` int NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `pendaftaran_id` (`pendaftaran_id`),
  KEY `field_id` (`field_id`),
  CONSTRAINT `pendaftaran_data_ibfk_1` FOREIGN KEY (`pendaftaran_id`) REFERENCES `pendaftaran` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pendaftaran_data_ibfk_2` FOREIGN KEY (`field_id`) REFERENCES `form_fields` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nama_lengkap` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `no_whatsapp` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `jenis_kelamin` enum('Laki-laki','Perempuan') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto_profil` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `otp_expires_at` datetime DEFAULT NULL,
  `role` enum('superadmin','penyelenggara','peserta') COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ukm` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `no_whatsapp` (`no_whatsapp`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `workshop_answers`
--

DROP TABLE IF EXISTS `workshop_answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workshop_answers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workshop_id` int NOT NULL,
  `mahasiswa_id` int NOT NULL,
  `question_id` int NOT NULL,
  `answer_text` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `workshop_discussions`
--

DROP TABLE IF EXISTS `workshop_discussions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workshop_discussions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workshop_id` int NOT NULL,
  `user_id` int NOT NULL,
  `user_type` enum('admin','mahasiswa') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'admin',
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `workshop_id` (`workshop_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `workshop_discussions_ibfk_1` FOREIGN KEY (`workshop_id`) REFERENCES `workshops` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `workshop_materials`
--

DROP TABLE IF EXISTS `workshop_materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workshop_materials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workshop_id` int NOT NULL,
  `judul_materi` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `deskripsi` text COLLATE utf8mb4_unicode_ci,
  `nama_file` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `workshop_id` (`workshop_id`),
  CONSTRAINT `workshop_materials_ibfk_1` FOREIGN KEY (`workshop_id`) REFERENCES `workshops` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `workshop_questions`
--

DROP TABLE IF EXISTS `workshop_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workshop_questions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workshop_id` int NOT NULL,
  `question_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `question_type` enum('text','textarea','rating','radio','dropdown') COLLATE utf8mb4_unicode_ci DEFAULT 'text',
  `options` text COLLATE utf8mb4_unicode_ci,
  `is_required` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `workshop_id` (`workshop_id`),
  CONSTRAINT `workshop_questions_ibfk_1` FOREIGN KEY (`workshop_id`) REFERENCES `workshops` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `workshops`
--

DROP TABLE IF EXISTS `workshops`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workshops` (
  `id` int NOT NULL AUTO_INCREMENT,
  `penyelenggara_id` int NOT NULL,
  `judul` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `visibilitas` enum('public','internal') COLLATE utf8mb4_unicode_ci DEFAULT 'public',
  `deskripsi` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `poster` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tanggal_waktu` datetime NOT NULL,
  `jam_selesai` datetime DEFAULT NULL,
  `lokasi` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipe_event` enum('gratis','berbayar') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'gratis',
  `harga` int DEFAULT '0',
  `nominal_denda` decimal(10,2) DEFAULT '0.00',
  `sertifikat_template` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sertifikat_prefix` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sertifikat_nomor_awal` int NOT NULL DEFAULT '1',
  `sertifikat_nama_fs` int NOT NULL DEFAULT '120',
  `sertifikat_nama_y_percent` decimal(7,2) NOT NULL DEFAULT '50.00',
  `sertifikat_nama_x_percent` decimal(7,2) NOT NULL DEFAULT '50.00',
  `sertifikat_nomor_fs` int NOT NULL DEFAULT '40',
  `sertifikat_nomor_y_percent` decimal(7,2) NOT NULL DEFAULT '60.00',
  `sertifikat_font` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'Poppins-SemiBold.ttf',
  `sertifikat_orientasi` enum('portrait','landscape') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'portrait',
  `sertifikat_nomor_x_percent` decimal(7,2) NOT NULL DEFAULT '50.00',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_kuesioner_active` tinyint(1) DEFAULT '0',
  `is_diskusi_active` tinyint(1) DEFAULT '1',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `maksimal_peserta` int DEFAULT '0',
  `sertifikat_custom_fs` int DEFAULT '30',
  `sertifikat_custom_x_percent` decimal(7,2) DEFAULT '50.00',
  `sertifikat_custom_y_percent` decimal(7,2) DEFAULT '70.00',
  `sertifikat_custom_type` enum('none','global','per_peserta') COLLATE utf8mb4_unicode_ci DEFAULT 'none',
  `sertifikat_custom_global_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-29 14:00:01
