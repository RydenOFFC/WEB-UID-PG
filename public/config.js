/**
 * RareIDs - Backend Configuration
 * 
 * Ubah URL backend di bawah ini sesuai dengan deployment Render Anda
 * 
 * LOCAL DEVELOPMENT:
 *   const BACKEND_URL = 'http://localhost:3000';
 * 
 * RENDER PRODUCTION:
 *   const BACKEND_URL = 'https://nama-web-kamu.onrender.com';
 */

const BACKEND_URL = 'https://web-uid-pg.onrender.com';

// ✅ Gunakan variabel ini di semua fetch calls:
// Contoh: fetch(BACKEND_URL + '/api/auth', {...})
// Atau gunakan helper: apiCall(method, '/api/auth', body)
