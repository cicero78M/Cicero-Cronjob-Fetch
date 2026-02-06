# Solusi Error 403 pada API Komplain TikTok

## Ringkasan Masalah

Error 403 (Forbidden) pada endpoint `POST /api/dashboard/komplain/tiktok` **BUKAN** disebabkan oleh payload yang tidak diterima dari frontend, melainkan karena **masalah autentikasi dan autorisasi**.

## Penyebab Error 403

### 1. Token Dashboard Tidak Dikirim atau Tidak Valid
Backend memerlukan token dari dashboard login (`POST /api/auth/dashboard-login`) yang harus dikirim melalui:
- Header: `Authorization: Bearer <token>`
- Cookie: `token=<token>`

### 2. Dashboard User Belum Disetup dengan Benar
Dashboard user harus memenuhi syarat:
- Status = `true` (aktif)
- Array `client_ids` tidak kosong
- Token sudah tersimpan di Redis dengan key pattern `login_token:<token>` dan value `dashboard:<dashboard_user_id>`

## Solusi untuk Frontend

### ✅ Dokumentasi Lengkap Tersedia

Kami telah membuat dokumentasi komprehensif untuk membantu frontend developer memperbaiki integrasi:

📄 **File: `docs/frontend_complaint_api_guide.md`**

Dokumentasi ini mencakup:

1. **Penjelasan Detail Error 403**
   - 4 penyebab umum beserta solusinya
   - Cara debugging dan troubleshooting

2. **Struktur Payload yang Benar**
   - Payload minimal (hanya `nrp`)
   - Payload lengkap dengan semua field opsional
   - Contoh-contoh konkret

3. **Implementasi Frontend Lengkap**
   - React/Next.js example dengan error handling
   - Axios setup dengan interceptor
   - Retry logic dan token management

4. **Response Format**
   - Success response (200)
   - Semua kemungkinan error response (400, 401, 403, 404)

5. **Checklist untuk Developer**
   - Langkah-langkah yang harus dipenuhi sebelum integrasi
   - Best practices untuk production

6. **Troubleshooting Guide**
   - Solusi untuk masalah umum
   - Query SQL untuk debugging

## Payload yang Diharapkan Backend

### Minimal (Wajib):
```json
{
  "nrp": "75020201"
}
```

### Lengkap (Opsional):
```json
{
  "nrp": "75020201",
  "issue": "Deskripsi masalah",
  "solution": "Solusi yang diberikan",
  "tiktok": "@username",
  "instagram": "@username_ig"
}
```

**Catatan Penting:** 
- Field `issue` dan `solution` adalah **OPSIONAL**
- Jika tidak diisi, backend akan generate otomatis berdasarkan data user
- Yang **WAJIB** hanya field `nrp`

## Instruksi untuk Frontend Developer

### Langkah 1: Pastikan Authentication
```javascript
// Kirim token yang didapat dari login dashboard
const token = localStorage.getItem('dashboardToken');

fetch('/api/dashboard/komplain/tiktok', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  credentials: 'include',
  body: JSON.stringify({ nrp: '75020201' })
})
```

### Langkah 2: Handle Error dengan Benar
```javascript
.catch(error => {
  if (error.response?.status === 403) {
    // Bukan masalah payload!
    // Periksa: apakah dashboard user sudah di-approve?
    // Periksa: apakah token masih valid?
    console.error('Access denied. Check dashboard user status.');
  }
})
```

### Langkah 3: Verifikasi Dashboard User di Database
```sql
-- Jalankan query ini untuk memastikan setup benar
SELECT id, email, status, client_ids 
FROM dashboard_users 
WHERE email = 'email-dashboard-user@example.com';

-- Pastikan:
-- 1. status = true
-- 2. client_ids array tidak kosong, contoh: ["client1", "client2"]
```

## Link Dokumentasi

1. **[docs/frontend_complaint_api_guide.md](./frontend_complaint_api_guide.md)** - Panduan lengkap untuk frontend (BACA INI DULU)
2. **[docs/complaint_response.md](./complaint_response.md)** - Dokumentasi API detail
3. **[README.md](../README.md)** - Sudah diupdate dengan referensi ke dokumentasi baru

## Kesimpulan

✅ **Error 403 BUKAN karena payload tidak diterima**

✅ **Error 403 karena:**
- Token tidak dikirim dengan benar
- Dashboard user belum di-approve atau tidak aktif
- Client_ids tidak di-set

✅ **Dokumentasi lengkap sudah tersedia** di `docs/frontend_complaint_api_guide.md`

✅ **Payload minimal yang dibutuhkan hanya `{ "nrp": "75020201" }`**

## Action Items untuk Frontend

1. **Baca dokumentasi lengkap:** `docs/frontend_complaint_api_guide.md`
2. **Pastikan token dikirim dengan benar** via Authorization header
3. **Implementasi error handling** sesuai contoh di dokumentasi
4. **Verifikasi dashboard user** sudah di-approve dan memiliki client_ids
5. **Test dengan payload minimal** terlebih dahulu: `{ "nrp": "75020201" }`

---

Jika masih ada pertanyaan setelah membaca dokumentasi, silakan hubungi tim backend dengan informasi:
- NRP yang digunakan
- Email dashboard user
- Exact error message dari response
