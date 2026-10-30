import type { IdentitySource, PlayerIdentity } from '../types/game.ts';

const LOCAL_SESSION_KEY = 'informatika_arena_session_v1';

interface DetectedPortalAccount {
  displayName?: string;
  nisn?: string;
  kelas?: string;
  email?: string;
  source?: IdentitySource;
}

declare global {
  interface Window {
    INFORMATIKA_FUN_USER?: {
      nama?: string;
      Nama_Siswa?: string;
      displayName?: string;
      nisn?: string | number;
      NISN?: string | number;
      kelas?: string;
      Kelas?: string;
      email?: string;
      Email?: string;
    };
  }
}

/**
 * Mendeteksi identitas siswa secara otomatis dari ekosistem website INFORMATIKA FUN
 * tanpa meminta siswa mengetik ulang nama apabila akun sudah login:
 * 1. Objek global `window.INFORMATIKA_FUN_USER` (integrasi modul langsung)
 * 2. `sessionStorage` resmi INFORMATIKA FUN (`namaSiswa`, `nisnSiswa`, `kelasSiswa`)
 * 3. Parameter URL jembatan (`?nama=...&nisn=...&kelas=...`)
 * 4. Sesi lokal tersimpan (`informatika_arena_session_v1`)
 */
export function detectWebsiteAccount(): DetectedPortalAccount {
  if (typeof window === 'undefined') return {};

  // 1. Global portal object
  const globalUser = window.INFORMATIKA_FUN_USER;
  if (globalUser) {
    const name =
      globalUser.Nama_Siswa || globalUser.nama || globalUser.displayName;
    if (name && name.trim()) {
      return {
        displayName: name.trim(),
        nisn: String(globalUser.NISN ?? globalUser.nisn ?? ''),
        kelas: String(globalUser.Kelas ?? globalUser.kelas ?? 'VII'),
        email: String(globalUser.Email ?? globalUser.email ?? ''),
        source: 'informatika_fun_session',
      };
    }
  }

  // 2. sessionStorage dari modul login INFORMATIKA FUN (sesuai struktur koleksi `siswa`)
  try {
    const namaSiswa = sessionStorage.getItem('namaSiswa');
    if (namaSiswa && namaSiswa.trim()) {
      return {
        displayName: namaSiswa.trim(),
        nisn: sessionStorage.getItem('nisnSiswa') || '',
        kelas: sessionStorage.getItem('kelasSiswa') || 'VII',
        email: sessionStorage.getItem('emailSiswa') || '',
        source: 'informatika_fun_session',
      };
    }
  } catch {
    // Ignore storage restriction
  }

  // 3. URL Query Bridge (?nama=...&kelas=...&nisn=...)
  const params = new URLSearchParams(window.location.search);
  const urlNama = params.get('nama') || params.get('user');
  if (urlNama && urlNama.trim()) {
    return {
      displayName: urlNama.trim(),
      nisn: params.get('nisn') || '',
      kelas: params.get('kelas') || 'VII',
      email: params.get('email') || '',
      source: 'url_bridge',
    };
  }

  return {};
}

export function loadStoredSession(): Partial<PlayerIdentity> | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PlayerIdentity>;
  } catch {
    return null;
  }
}

export function saveStoredSession(identity: PlayerIdentity): void {
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(identity));
    // Sinkronkan juga ke sessionStorage INFORMATIKA FUN jika berasal dari login siswa
    if (identity.source === 'registered_student' || identity.source === 'informatika_fun_session') {
      sessionStorage.setItem('namaSiswa', identity.displayName);
      if (identity.nisn) sessionStorage.setItem('nisnSiswa', identity.nisn);
      if (identity.kelas) sessionStorage.setItem('kelasSiswa', identity.kelas);
      if (identity.email) sessionStorage.setItem('emailSiswa', identity.email);
    }
  } catch {
    // Ignore storage error
  }
}

export async function initializeAutomaticIdentity(): Promise<PlayerIdentity> {
  const stored = loadStoredSession();
  const portal = detectWebsiteAccount();

  const payload = {
    sessionToken: stored?.sessionToken,
    displayName: portal.displayName || stored?.displayName,
    nisn: portal.nisn || stored?.nisn,
    kelas: portal.kelas || stored?.kelas,
    email: portal.email || stored?.email,
    source: portal.source || stored?.source,
  };

  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error('Gagal menginisialisasi sesi identitas.');
  }

  const data = (await res.json()) as { identity: PlayerIdentity };
  saveStoredSession(data.identity);
  return data.identity;
}
