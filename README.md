# Vid2GIF - Konverter Video ke GIF Statis TFT 1.28" (240x240)

Aplikasi web statis modern (100% Client-Side) untuk mengonversi file video menjadi animasi GIF teroptimasi khusus layar TFT LCD 1.28 inch (seperti GC9A01 / ST7789) dengan resolusi native **240x240 pixel**.

![TFT 1.28 Display GIF Converter](https://img.shields.io/badge/TFT_Display-240x240-06b6d4?style=for-the-badge&logo=microchip)
![GitHub Pages Ready](https://img.shields.io/badge/Deployment-GitHub_Pages-6366f1?style=for-the-badge&logo=github)

---

## 🌟 Fitur Utama

1. **WhatsApp-Style Interactive Cropper (1:1 Aspect Ratio)**:
   - Fitur potong video otomatis ke rasio 1:1 dan resolusi 240x240 px.
   - Kontrol geser (pan X, Y) dan zoom (scroll wheel / slider / pinch touch) persis seperti pengatur foto profil WhatsApp.
   - Mode overlay mask **Layar Bulat 1.28" (GC9A01)** dan **Layar Kotak 240x240**.

2. **Kalkulator Resolusi & Size Otomatis (Target File Size & FPS)**:
   - Pengguna dapat memasukkan **Target Ukuran File GIF** (misal: 256 KB, 500 KB, 1 MB untuk memori SPIFFS / LittleFS ESP32 / Arduino).
   - Pengguna dapat menentukan **Target FPS** (5 - 30 FPS).
   - Web mengkalkulasi otomatis resolusi export terbaik (240x240, 200x200, 180x180, 160x160, dll.) dan kedalaman palet warna (256, 128, 64, 32 warna) agar file GIF dipastikan **muat di bawah batas target**.

3. **Simolator Hardware TFT 1.28"**:
   - Tampilan preview hasil GIF langsung di dalam simulator bezel jam tangan / display TFT 1.28" asli.

4. **Ekspor C-Array (Bonus)**:
   - Pilihan salin byte array C (`const uint8_t PROGMEM tft_gif_data[]`) untuk kemudahan pengembang mikrokontroler ESP32 / Arduino.

5. **100% Statis & Tanpa Server**:
   - Diproses sepenuhnya di dalam browser pengguna (Client-Side HTML5, CSS3, Vanilla JS).
   - Sangat ringan dan siap di-host langsung melalui **GitHub Pages**.

---

## 🚀 Cara Upload ke GitHub & Mengaktifkan GitHub Pages

### Langkah 1: Push ke GitHub Repositori Anda

Buka terminal pada folder proyek ini dan jalankan perintah berikut:

```bash
# Inisialisasi Git
git init

# Tambahkan semua file
git add .

# Commit perdana
git commit -m "Initial commit: Vid2GIF TFT 1.28 inch web converter"

# Hubungkan ke repositori GitHub Anda (Ganti URL dengan repo Anda)
git remote add origin https://github.com/USERNAME/Vid2gif.git
git branch -M main
git push -u origin main
```

### Langkah 2: Aktifkan GitHub Pages

1. Buka halaman repositori Anda di GitHub.
2. Masuk ke menu **Settings** > **Pages** (di sidebar kiri).
3. Pada bagian **Build and deployment**:
   - **Source**: Pilih `Deploy from a branch`.
   - **Branch**: Pilih `main` dan folder `/ (root)`.
4. Klik **Save**.
5. Situs Anda akan online secara otomatis di URL: `https://USERNAME.github.io/Vid2gif/`

---

## 💻 Lisensi & Kredit

- Dibuat untuk komunitas pembuat hardware, smartwatch custom, dan proyek IoT mikrokontroler ESP32 / Arduino.
- NeuQuant Color Quantization & LZW Encoder engine disematkan secara murni dalam Javascript.
