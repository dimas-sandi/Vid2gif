# Vid2GIF - Konverter & Resizer GIF Statis TFT 1.28" (240x240)

Aplikasi web statis modern (100% Client-Side) untuk mengonversi file video dan mengubah ukuran/mengompresi file GIF menjadi animasi GIF teroptimasi khusus layar TFT LCD 1.28 inch (GC9A01 / ST7789) dengan resolusi native **240x240 pixel**.

![TFT 1.28 Display GIF Converter](https://img.shields.io/badge/TFT_Display-240x240-06b6d4?style=for-the-badge&logo=microchip)
![GitHub Pages Ready](https://img.shields.io/badge/Deployment-GitHub_Pages-6366f1?style=for-the-badge&logo=github)

---

## 🌟 Fitur Utama

### Tab 1: Video ke GIF TFT 1.28"
- Konversi file MP4, WebM, MOV langsung di browser.
- **WhatsApp-Style Interactive Cropper**: Potong otomatis ke rasio 1:1, geser (*pan*), dan *zoom* interaktif (1.0x - 4.0x).
- **Target Size & FPS Calculator**: Tentukan target ukuran file (misal: 256 KB, 500 KB, 1 MB) dan target FPS (5 - 30 FPS). Sistem akan mengkalkulasi otomatis resolusi export terbaik (240x240, 200x200, 180x180, dll.) dan jumlah warna palet.

### Tab 2: GIF Resizer & Optimizer (Target Size)
- Upload file `.gif` yang sudah ada untuk di-resize dan dikompresi ulang sesuai batas memori (*Target Size KB*).
- **WhatsApp-Style GIF Cropper**: Geser dan zoom file GIF yang ada ke tampilan 1:1 240x240 px.
- **Frame Subsampling & Re-compression**: Menyesuaikan FPS dan memotong jumlah warna palet agar muat di bawah batas KB yang ditentukan.

### Fitur Simulator & Ekspor:
- **Simulator Hardware GC9A01 1.28"**: Preview animasi GIF secara langsung di dalam bezel jam tangan TFT bulat dengan efek *glass glare*.
- **C-Array Exporter (ESP32/Arduino)**: Fitur salin buffer `const uint8_t PROGMEM tft_gif_data[]` untuk pemrogram mikrokontroler.


3. Di bagian **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / `/ (root)`
4. Klik **Save**. Situs web Anda akan aktif secara gratis di `https://dimas-sandi.github.io/Vid2gif/`.
