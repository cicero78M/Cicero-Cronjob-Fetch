# Panduan Frontend untuk API Komplain (Instagram & TikTok)

> **Note**: This guide uses mixed Indonesian and English to best serve Indonesian developers working with English code examples. Key sections are in Indonesian, while code examples and technical details use English for clarity.

## Ringkasan

Dokumen ini memberikan panduan lengkap untuk frontend dalam mengintegrasikan endpoint komplain Instagram dan TikTok. Dokumen ini dibuat untuk mengatasi error 403 yang sering terjadi dan memastikan sinkronisasi antara frontend dan backend.

## Endpoint Komplain

### 1. Komplain Instagram
```
POST /api/dashboard/komplain/insta
```

### 2. Komplain TikTok
```
POST /api/dashboard/komplain/tiktok
```

## Penyebab Error 403 (Forbidden)

Error 403 terjadi karena **masalah autentikasi/autorisasi**, bukan karena payload yang hilang. Berikut adalah penyebab umum:

### 1. Token Dashboard Tidak Valid atau Tidak Ada
**Masalah:** Frontend tidak mengirim token dashboard yang valid.

**Solusi:**
- Pastikan user sudah login melalui endpoint `POST /api/auth/dashboard-login`
- Token harus dikirim dalam salah satu cara berikut:
  ```javascript
  // Opsi 1: Authorization Header (Recommended)
  headers: {
    'Authorization': 'Bearer ' + token
  }
  
  // Opsi 2: Cookie
  // Token otomatis dikirim jika disimpan di cookie dengan nama 'token'
  ```

### 2. Token Kadaluarsa
**Masalah:** Token sudah expired atau tidak lagi valid di Redis.

**Solusi:**
- Implementasi refresh token atau re-login jika dapat error 401
- Cek apakah token masih ada di Redis (`login_token:${token}`)

### 3. Dashboard User Tidak Memiliki Client ID yang Valid
**Masalah:** Dashboard user belum memiliki `client_ids` yang terdaftar.

**Solusi:**
- Pastikan dashboard user sudah di-approve oleh admin
- Dashboard user harus memiliki minimal 1 client_id di array `client_ids`

### 4. Dashboard User Status Tidak Aktif
**Masalah:** Status dashboard user adalah `false` atau tidak aktif.

**Solusi:**
- Pastikan `status` dashboard user adalah `true`
- Hubungi admin untuk aktivasi akun

## Struktur Payload yang Benar

### Payload Minimal (Wajib)
```json
{
  "nrp": "75020201"
}
```

**Field Wajib:**
- `nrp` (string/number): NRP/NIP personel yang terdaftar di sistem

### Payload Lengkap (Opsional)
```json
{
  "nrp": "75020201",
  "issue": "Sudah melaksanakan TikTok tetapi belum tercatat di dashboard",
  "solution": "Mohon cek kembali data komentar di dashboard dan kirim bukti jika masih belum tercatat",
  "message": "Pesan Komplain\nNRP: 75020201\nNama: John Doe\nUsername TikTok: @johndoe\n\nKendala\n- Sudah melaksanakan TikTok tetapi belum tercatat",
  "tiktok": "@johndoe",
  "instagram": "@johndoe_ig"
}
```

**Field Opsional:**
- `issue` / `kendala` / `problem`: Deskripsi masalah
- `solution` / `solusi` / `tindak_lanjut`: Tindak lanjut yang diberikan
- `message` / `pesan` / `complaint` / `raw` / `text`: Pesan komplain dalam format lengkap
- `tiktok` / `username_tiktok`: Username TikTok
- `instagram` / `insta` / `username_ig` / `username_instagram`: Username Instagram

**Catatan:**
- Jika field opsional tidak diisi, backend akan generate secara otomatis berdasarkan data user
- Backend akan parsing pesan komplain untuk extract informasi seperti NRP, nama, polres, dan daftar kendala

## Contoh Implementasi Frontend

### React/Next.js Example

```javascript
// utils/apiClient.js
export async function postComplaint(platform, data) {
  const endpoint = platform === 'tiktok' 
    ? '/api/dashboard/komplain/tiktok'
    : '/api/dashboard/komplain/insta';
  
  const token = localStorage.getItem('dashboardToken'); // atau dari cookies
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include', // untuk mengirim cookies
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Request failed');
  }
  
  return response.json();
}

// components/ComplaintForm.jsx
import { useState } from 'react';
import { postComplaint } from '../utils/apiClient';

export default function ComplaintForm() {
  const [nrp, setNrp] = useState('');
  const [issue, setIssue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const result = await postComplaint('tiktok', {
        nrp: nrp,
        issue: issue || undefined, // backend akan generate jika kosong
      });
      
      console.log('Success:', result);
      alert('Komplain berhasil dikirim');
      
      // Handle success response
      // result.data akan berisi:
      // - message: pesan yang sudah diformat
      // - issue: kendala yang diidentifikasi
      // - solution: solusi yang diberikan
      // - whatsappDelivery: status pengiriman WA
      
    } catch (err) {
      console.error('Error:', err);
      
      // Handle specific errors
      if (err.message.includes('Token required')) {
        setError('Silakan login terlebih dahulu');
        // Redirect ke login page
      } else if (err.message.includes('Forbidden')) {
        setError('Akses ditolak. Hubungi administrator untuk aktivasi akun.');
      } else if (err.message.includes('User tidak ditemukan')) {
        setError('NRP tidak ditemukan dalam sistem');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>NRP/NIP:</label>
        <input
          type="text"
          value={nrp}
          onChange={(e) => setNrp(e.target.value)}
          required
        />
      </div>
      
      <div>
        <label>Kendala (Opsional):</label>
        <textarea
          value={issue}
          onChange={(e) => setIssue(e.target.value)}
          placeholder="Backend akan generate otomatis jika kosong"
        />
      </div>
      
      {error && <div className="error">{error}</div>}
      
      <button type="submit" disabled={loading}>
        {loading ? 'Mengirim...' : 'Kirim Komplain'}
      </button>
    </form>
  );
}
```

### Axios Example

```javascript
import axios from 'axios';

// Setup axios instance dengan interceptor
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
});

// Request interceptor untuk menambahkan token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('dashboardToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor untuk handle error
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token invalid atau expired
      localStorage.removeItem('dashboardToken');
      window.location.href = '/login';
    } else if (error.response?.status === 403) {
      // Forbidden - tidak punya akses
      console.error('Access denied:', error.response.data);
    }
    return Promise.reject(error);
  }
);

// Function untuk submit complaint
export async function submitTiktokComplaint(data) {
  try {
    const response = await api.post('/api/dashboard/komplain/tiktok', data);
    return response.data;
  } catch (error) {
    throw error;
  }
}
```

## Response Format

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "platform": "TikTok",
    "message": "Selamat pagi! Kami menindaklanjuti laporan yang Anda sampaikan.\n\n*Pelapor*: John Doe\n\n*NRP/NIP*: 75020201\n\n*Kendala*:\nSudah melaksanakan TikTok tetapi belum tercatat\n\n*Solusi/Tindak Lanjut*:\n1) Pastikan komentar dilakukan menggunakan akun yang tercatat (TikTok: @johndoe).\n2) Pastikan sudah mengisi absensi komentar TikTok di dashboard.",
    "issue": "Sudah melaksanakan TikTok tetapi belum tercatat",
    "solution": "1) Pastikan komentar dilakukan menggunakan akun yang tercatat (TikTok: @johndoe).\n2) Pastikan sudah mengisi absensi komentar TikTok di dashboard.",
    "channel": "whatsapp",
    "whatsappDelivery": {
      "personnel": {
        "status": "sent",
        "target": "628123456789@c.us"
      },
      "dashboardUser": {
        "status": "sent",
        "target": "628987654321@c.us"
      }
    },
    "reporter": {
      "nrp": "75020201",
      "name": "John Doe",
      "whatsapp": "628123456789",
      "email": "johndoe@example.com"
    },
    "dashboard": {
      "whatsapp": "628987654321"
    }
  }
}
```

### Error Response (400 - Bad Request)
```json
{
  "success": false,
  "message": "nrp wajib diisi"
}
```

### Error Response (401 - Unauthorized)
```json
{
  "success": false,
  "message": "Token required"
}
```

atau

```json
{
  "success": false,
  "message": "Invalid token"
}
```

### Error Response (403 - Forbidden)
```json
{
  "success": false,
  "message": "Forbidden"
}
```

**Penyebab 403:**
- Dashboard user belum memiliki client_ids
- Dashboard user status tidak aktif
- Client_ids array kosong

### Error Response (404 - Not Found)
```json
{
  "success": false,
  "message": "User tidak ditemukan"
}
```

## Checklist untuk Frontend Developer

Sebelum melakukan integrasi, pastikan:

- [ ] **Authentication**: User sudah login via `POST /api/auth/dashboard-login`
- [ ] **Token Storage**: Token disimpan dengan aman (localStorage/cookies)
- [ ] **Token Sending**: Token dikirim via `Authorization: Bearer <token>` header
- [ ] **Credentials**: Request dibuat dengan `credentials: 'include'` untuk cookies
- [ ] **Payload**: Minimal mengirim field `nrp`
- [ ] **Error Handling**: Handle error 401, 403, 404, dan 400
- [ ] **Token Refresh**: Implementasi logic untuk re-login jika token expired
- [ ] **Response Display**: Tampilkan `message`, `whatsappDelivery` status, dan data reporter
- [ ] **Loading State**: Tampilkan loading indicator saat request
- [ ] **Success Feedback**: Berikan feedback ke user setelah berhasil submit

## Troubleshooting

### Problem: Selalu mendapat 403 meskipun token valid
**Solusi:**
1. Cek apakah dashboard user sudah approved oleh admin
2. Verify bahwa `client_ids` array tidak kosong di database:
   ```sql
   SELECT id, email, status, client_ids 
   FROM dashboard_users 
   WHERE email = 'your-email@example.com';
   ```
3. Pastikan status = `true`

### Problem: Token tidak terdeteksi di backend
**Solusi:**
1. Pastikan header format benar: `Authorization: Bearer <token>`
2. Jika pakai cookies, pastikan nama cookie adalah `token`
3. Cek CORS settings - pastikan `credentials: true` di CORS config backend

### Problem: User tidak ditemukan (404)
**Solusi:**
1. Verify NRP ada di database `users` table
2. Cek format NRP - backend akan normalize (trim whitespace, handle string/number)

### Problem: Payload tidak diterima
**Solusi:**
1. Pastikan `Content-Type: application/json` di headers
2. Data harus di-stringify: `JSON.stringify(data)`
3. Minimal harus ada field `nrp`

## Best Practices

1. **Validasi Input di Frontend**
   ```javascript
   function validateNRP(nrp) {
     if (!nrp || String(nrp).trim() === '') {
       return { valid: false, error: 'NRP wajib diisi' };
     }
     return { valid: true };
   }
   ```

2. **Implementasi Retry Logic untuk Network Errors**
   ```javascript
   async function submitWithRetry(data, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await postComplaint('tiktok', data);
       } catch (error) {
         if (error.response?.status === 401 || error.response?.status === 403) {
           throw error; // Don't retry auth errors
         }
         if (i === maxRetries - 1) throw error;
         await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
       }
     }
   }
   ```

3. **Cache Token di Memory (Optional)**
   ```javascript
   let tokenCache = null;
   
   function getToken() {
     if (!tokenCache) {
       tokenCache = localStorage.getItem('dashboardToken');
     }
     return tokenCache;
   }
   
   function clearToken() {
     tokenCache = null;
     localStorage.removeItem('dashboardToken');
   }
   ```

4. **Logging untuk Debugging**
   ```javascript
   async function postComplaint(platform, data) {
     console.log('[API] Sending complaint:', { platform, nrp: data.nrp });
     
     try {
       const result = await api.post(endpoint, data);
       console.log('[API] Success:', result.data);
       return result.data;
     } catch (error) {
       console.error('[API] Error:', {
         status: error.response?.status,
         message: error.response?.data?.message,
         data: error.response?.data
       });
       throw error;
     }
   }
   ```

## Referensi

- [complaint_response.md](./complaint_response.md) - Dokumentasi lengkap API komplain
- [login_api.md](./login_api.md) - Dokumentasi API login dashboard
- [backend_login_best_practices.md](./backend_login_best_practices.md) - Best practices login

## Support

Jika masih mengalami masalah setelah mengikuti panduan ini:
1. Cek log backend untuk detail error
2. Verify data dashboard user di database
3. Hubungi tim backend dengan informasi: NRP, dashboard user email, dan exact error message
