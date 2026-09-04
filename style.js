// ============================================================
// HOMIEGEN – SUPABASE EDITION
// ============================================================

const SESSION = 'homiegen_session_v2';
const PREFS = 'homiegen_prefs_v2';

let dbData = null;
let isSaving = false;

// ============================================================
// API HELPER
// ============================================================
async function api(action, data = {}) {
  const response = await fetch('/.netlify/functions/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data })
  });
  return response.json();
}

async function loadDb() {
  if (dbData) return dbData;
  try {
    const data = await api('load');
    dbData = data;
    return data;
  } catch {
    return seed();
  }
}

async function saveDb() {
  if (isSaving) return;
  isSaving = true;
  try {
    const data = dbData;
    await api('save', data);
  } catch (e) {
    console.error('Save error:', e);
  }
  isSaving = false;
}

// ============================================================
// HASH & RANDOM
// ============================================================
const hash = v => {
  let h = 5381;
  for (const c of v) h = ((h << 5) + h) ^ c.charCodeAt(0);
  return (h >>> 0).toString(16);
};

const randomPassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  let pwd = '';
  for (let i = 0; i < 16; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pwd;
};

const generateLicenseKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 4; i++) {
    if (i > 0) key += '-';
    for (let j = 0; j < 4; j++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return 'lft-' + key;
};

// ============================================================
// SEED DATA
// ============================================================
const seed = () => ({
  users: [
    { id: 1, username: 'nova', password: hash('K7mQ92xL4vT8pR6zN3'), role: 'admin', ip: '', cooldowns: {}, created: '2026-09-01', blacklisted: false, _plainPassword: 'K7mQ92xL4vT8pR6zN3', license_key: null, license_type: null, daily_limit: 0, used_today: 0, email: 'nova@homiegen.com' },
    { id: 2, username: 'gurke', password: hash('K7mQ92xL4vT8pR6zN3'), role: 'admin', ip: '', cooldowns: {}, created: '2026-09-01', blacklisted: false, _plainPassword: 'K7mQ92xL4vT8pR6zN3', license_key: null, license_type: null, daily_limit: 0, used_today: 0, email: 'gurke@homiegen.com' }
  ],
  services: [
    { id: 1, name: 'Steam', stock: 0, cooldown: 0, image: '' },
    { id: 2, name: 'Netflix', stock: 0, cooldown: 0, image: '' },
    { id: 3, name: 'Spotify', stock: 0, cooldown: 0, image: '' }
  ],
  accounts: [],
  deliveries: [],
  changelog: [],
  logs: [],
  licenses: []
});

let idCache = {};

async function getNextId(table) {
  const data = await load();
  const items = data[table] || [];
  return Math.max(0, ...items.map(x => x.id)) + 1;
}

// ============================================================
// DB OPERATIONS
// ============================================================
async function load() {
  try {
    const data = await loadDb();
    data.deliveries = (data.deliveries || []).filter(x => x.expires > Date.now());
    return data;
  } catch { return seed(); }
}

async function save(d) {
  d.services.forEach(s => {
    s.stock = d.accounts.filter(a => a.service_id === s.id && a.status === 'available').length;
  });
  dbData = d;
  await saveDb();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function logAction(d, action, user) {
  const id = await getNextId('logs');
  d.logs.unshift({ id, action, user, timestamp: new Date().toLocaleString('de-DE') });
  await save(d);
}

// ============================================================
// SESSION
// ============================================================
function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION));
    if (!s || s.expires < Date.now()) throw 0;
    return s;
  } catch { localStorage.removeItem(SESSION); return null; }
}

async function current() {
  const s = getSession();
  if (!s) return null;
  const d = await load();
  return d.users.find(u => u.id === s.userId);
}

function signIn(u) {
  localStorage.setItem(SESSION, JSON.stringify({ userId: u.id, expires: Date.now() + 86400000 }));
}

// ============================================================
// LOGIN
// ============================================================
let loginRole = 'user';

async function loginRequest(username, password, role) {
  const d = await load();
  const user = d.users.find(u => u.username === username);
  
  if (!user) {
    return { ok: false, json: async () => ({ error: 'Benutzer existiert nicht.' }) };
  }
  
  if (user.blacklisted) {
    return { ok: false, json: async () => ({ error: 'Account wurde geblacklistet.' }) };
  }
  
  if (user.password !== hash(password)) {
    return { ok: false, json: async () => ({ error: 'Falsches Passwort.' }) };
  }
  
  if (role && user.role !== role) {
    return { ok: false, json: async () => ({ error: `Kein ${role}-Zugang.` }) };
  }
  
  return { ok: true, json: async () => ({ username: user.username, role: user.role }) };
}

// ============================================================
// APP & TOAST
// ============================================================
const app = document.querySelector('#app');
const toast = m => {
  const n = document.createElement('div');
  n.className = 'toast';
  n.textContent = m;
  const container = document.querySelector('#toasts');
  if (container) container.append(n);
  setTimeout(() => n.remove(), 3200);
};

// ============================================================
// PREFS & PARTICLES
// ============================================================
const defaults = { particles: 34, type: 'dot', motion: 'float', volume: 35, menuSounds: true, autoCopy: false, language: 'en', primaryColor: '#5865f2', secondaryColor: '#818bff' };

function prefs() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS)) }; } catch { return { ...defaults }; }
}

function savePrefs(p) { localStorage.setItem(PREFS, JSON.stringify(p)); particles(); applyTheme(); }

function particles() {
  const p = prefs(), layer = document.querySelector('#particles');
  if (!layer) return;
  layer.className = `${p.type} ${p.motion}`;
  layer.replaceChildren(...Array.from({ length: p.particles }, (_, i) => {
    const e = document.createElement('span');
    e.style.left = `${(i * 43) % 100}%`;
    e.style.top = `${(i * 67) % 100}%`;
    e.style.animationDelay = `-${i % 9}s`;
    e.style.animationDuration = `${5 + i % 6}s`;
    return e;
  }));
}

function applyTheme() {
  const p = prefs();
  const root = document.documentElement;
  root.style.setProperty('--blue', p.primaryColor);
  root.style.setProperty('--blue2', p.secondaryColor);
}

// ============================================================
// SOUND
// ============================================================
let audioContext;

function sound(kind = 'menu') {
  if (!prefs().menuSounds) return;
  try {
    audioContext ??= new(window.AudioContext || window.webkitAudioContext)();
    const o = audioContext.createOscillator(), gain = audioContext.createGain();
    const v = prefs().volume / 100;
    const tones = { menu: [440, 0.055], ok: [660, 0.11], restock: [523, 0.18], error: [180, 0.12] }[kind] || [440, .05];
    o.frequency.value = tones[0];
    o.type = kind === 'error' ? 'sawtooth' : 'sine';
    gain.gain.setValueAtTime(Math.max(.006, v * .045), audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + tones[1]);
    o.connect(gain).connect(audioContext.destination);
    o.start();
    o.stop(audioContext.currentTime + tones[1]);
  } catch {}
}

// ============================================================
// LOGIN
// ============================================================
function login() {
  const admin = loginRole === 'admin';
  const isEn = prefs().language === 'en';
  
  app.innerHTML = `
  <main class="login-shell">
    <section class="login-card">
      <div class="brand"><div class="brand-mark"><i class="fa-solid fa-bolt"></i></div>HomieGen</div>
      <div class="login-switch">
        <button data-role="user" class="${admin ? '' : 'active'}"><i class="fa-solid fa-user"></i> User</button>
        <button data-role="admin" class="${admin ? 'active' : ''}"><i class="fa-solid fa-shield-halved"></i> Admin</button>
      </div>
      
      <div style="display:flex;gap:8px;margin:16px 0 12px 0;">
        <button class="btn" id="login-tab" style="flex:1;background:var(--blue);">${isEn ? 'Login' : 'Einloggen'}</button>
        <button class="btn ghost" id="register-tab" style="flex:1;">${isEn ? 'Register' : 'Registrieren'}</button>
      </div>
      
      <form id="login-form">
        <span class="login-badge ${admin ? 'admin' : ''}">${admin ? 'ADMIN-BEREICH' : 'USER-BEREICH'}</span>
        <h1>${admin ? 'Admin Login' : 'User Login'}</h1>
        <p class="subtle">${admin ? 'Adminbereich für deine Verwaltung.' : 'Hole dir Accounts aus dem verfügbaren Stock.'}</p>
        <label class="field"><span>${isEn ? 'Username' : 'Benutzername'}</span><input name="username" required autofocus placeholder="${admin ? 'nova' : 'User'}"></label>
        <label class="field"><span>${isEn ? 'Password' : 'Passwort'}</span>
          <div class="password">
            <input name="password" type="password" required placeholder="${isEn ? 'Password' : 'Passwort'}">
            <button type="button" id="eye"><i class="fa-solid fa-eye"></i></button>
          </div>
        </label>
        <button class="btn full" type="submit">${isEn ? 'Login' : 'Einloggen'} <i class="fa-solid fa-arrow-right"></i></button>
      </form>
      
      <form id="register-form" style="display:none;">
        <span class="login-badge">${isEn ? 'CREATE ACCOUNT' : 'ACCOUNT ERSTELLEN'}</span>
        <h1>${isEn ? 'Register' : 'Registrieren'}</h1>
        <p class="subtle">${isEn ? 'Create your account to get started.' : 'Erstelle deinen Account um loszulegen.'}</p>
        <label class="field"><span>${isEn ? 'Username' : 'Benutzername'}</span><input name="username" required placeholder="${isEn ? 'Choose a username' : 'Wähle einen Benutzernamen'}"></label>
        <label class="field"><span>${isEn ? 'Email' : 'E-Mail'}</span><input name="email" type="email" required placeholder="user@email.com"></label>
        <label class="field"><span>${isEn ? 'Password' : 'Passwort'}</span>
          <div class="password">
            <input name="password" type="password" required placeholder="${isEn ? 'Choose a password' : 'Wähle ein Passwort'}">
            <button type="button" id="eye-reg"><i class="fa-solid fa-eye"></i></button>
          </div>
        </label>
        <button class="btn full" type="submit">${isEn ? 'Create Account' : 'Account erstellen'} <i class="fa-solid fa-user-plus"></i></button>
      </form>
    </section>
  </main>`;
  
  document.querySelector('#login-tab').onclick = () => {
    document.querySelector('#login-form').style.display = 'block';
    document.querySelector('#register-form').style.display = 'none';
    document.querySelector('#login-tab').className = 'btn';
    document.querySelector('#register-tab').className = 'btn ghost';
    document.querySelector('#login-tab').style.background = 'var(--blue)';
  };
  document.querySelector('#register-tab').onclick = () => {
    document.querySelector('#login-form').style.display = 'none';
    document.querySelector('#register-form').style.display = 'block';
    document.querySelector('#register-tab').className = 'btn';
    document.querySelector('#login-tab').className = 'btn ghost';
    document.querySelector('#register-tab').style.background = 'var(--blue)';
  };
  
  document.querySelectorAll('[data-role]').forEach(b => {
    b.onclick = () => { sound('menu'); loginRole = b.dataset.role; login(); };
  });
  
  document.querySelector('#eye').onclick = e => {
    const x = e.currentTarget.previousElementSibling;
    x.type = x.type === 'password' ? 'text' : 'password';
  };
  document.querySelector('#eye-reg').onclick = e => {
    const x = e.currentTarget.previousElementSibling;
    x.type = x.type === 'password' ? 'text' : 'password';
  };
  
  document.querySelector('#login-form').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const username = f.get('username');
    const password = f.get('password');

    try {
      const response = await loginRequest(username, password, loginRole);
      const data = await response.json();

      if (!response.ok) {
        sound('error');
        return toast(data.error || 'Falsche Zugangsdaten.');
      }

      const d = await load();
      let user = d.users.find(u => u.username === data.username);
      if (!user) {
        const id = await getNextId('users');
        user = {
          id,
          username: data.username,
          password: hash(password),
          role: data.role,
          ip: '',
          cooldowns: {},
          created: new Date().toISOString().slice(0, 10),
          blacklisted: false,
          _plainPassword: password,
          license_key: null,
          license_type: null,
          daily_limit: 0,
          used_today: 0,
          email: ''
        };
        d.users.push(user);
        await save(d);
      }
      signIn(user);
      await logAction(d, `${data.role === 'admin' ? 'Admin' : 'User'} login`, user.username);
      sound('ok');
      toast(`✅ ${isEn ? 'Login successful!' : 'Login erfolgreich!'}`);
      render();
    } catch (error) {
      sound('error');
      toast('Fehler beim Login.');
    }
  };
  
  document.querySelector('#register-form').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const username = f.get('username');
    const email = f.get('email');
    const password = f.get('password');

    try {
      const d = await load();
      if (d.users.find(u => u.username === username)) {
        sound('error');
        return toast(isEn ? '❌ Username already exists.' : '❌ Benutzername existiert bereits.');
      }
      if (d.users.find(u => u.email === email)) {
        sound('error');
        return toast(isEn ? '❌ Email already exists.' : '❌ E-Mail existiert bereits.');
      }

      const hashedPassword = hash(password);
      const id = await getNextId('users');
      const newUser = {
        id,
        username: username,
        email: email,
        password: hashedPassword,
        role: 'user',
        ip: '',
        cooldowns: {},
        created: new Date().toISOString().slice(0, 10),
        blacklisted: false,
        _plainPassword: password,
        license_key: null,
        license_type: null,
        daily_limit: 0,
        used_today: 0
      };
      d.users.push(newUser);
      await save(d);
      
      await logAction(d, `User ${username} registered`, username);
      sound('ok');
      toast(`✅ ${isEn ? 'Account created successfully! Please login.' : 'Account erfolgreich erstellt! Bitte einloggen.'}`);
      
      document.querySelector('#login-tab').click();
      document.querySelector('#login-form input[name="username"]').value = username;
    } catch (error) {
      sound('error');
      toast(isEn ? '❌ Error creating account.' : '❌ Fehler beim Erstellen des Accounts.');
    }
  };
}

// ============================================================
// NAVIGATION
// ============================================================
let tab = 'home';

function nav(user, content) {
  const admin = user.role === 'admin';
  const isEn = prefs().language === 'en';
  
  const items = admin ?
    [['home', 'chart-pie', isEn ? 'Dashboard' : 'Dashboard'], 
     ['accounts', 'key', isEn ? 'Accounts' : 'Accounts'], 
     ['users', 'users', isEn ? 'Users' : 'Benutzer'], 
     ['licenses', 'ticket', isEn ? 'License Management' : 'Lizenzverwaltung'],
     ['changelog', 'clock-rotate-left', isEn ? 'Changelog' : 'Änderungen'], 
     ['logs', 'list', isEn ? 'Logs' : 'Protokolle']] :
    [['home', 'house', isEn ? 'Dashboard' : 'Dashboard']];
  items.push(['settings', 'gear', isEn ? 'Settings' : 'Einstellungen']);
  
  app.innerHTML = `
  <div class="layout">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark"><i class="fa-solid fa-bolt"></i></div><span>HomieGen</span></div>
      <nav class="nav">${items.map(([key, icon, label]) => `<button data-tab="${key}" class="${tab === key ? 'active' : ''}"><i class="fa-solid fa-${icon}"></i><span>${label}</span></button>`).join('')}</nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div>
          <h1>${tab === 'settings' ? (isEn ? 'Settings' : 'Einstellungen') : admin ? (isEn ? 'Admin Panel' : 'Admin-Bereich') : (isEn ? `Welcome, ${esc(user.username)}` : `Willkommen, ${esc(user.username)}`)}</h1>
          <p>${tab === 'settings' ? (isEn ? 'Customize everything.' : 'Alles anpassen.') : admin ? (isEn ? 'Manage everything.' : 'Alles verwalten.') : (isEn ? 'Your account is ready.' : 'Dein Account ist bereit.')}</p>
        </div>
        <div class="identity">
          <div class="avatar">${esc(user.username[0].toUpperCase())}</div>
          <span class="name">${esc(user.username)}</span>
          <button id="logout" class="btn ghost">${isEn ? 'Log out' : 'Abmelden'}</button>
        </div>
      </header>
      <div class="view view-${tab}" style="padding-bottom:20px;">${content}</div>
    </main>
  </div>`;
  
  document.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { sound('menu'); tab = b.dataset.tab; render(); }; });
  document.querySelector('#logout').onclick = () => { sound('menu'); localStorage.removeItem(SESSION); tab = 'home'; loginRole = 'user'; render(); };
}

// ============================================================
// STATS
// ============================================================
function stats(d) {
  const totalAccounts = d.accounts.length;
  const availableAccounts = d.accounts.filter(a => a.status === 'available').length;
  const totalUsers = d.users.filter(u => !u.blacklisted).length;
  const totalLicenses = d.licenses.length;
  const isEn = prefs().language === 'en';
  
  return `
  <div class="grid-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin-bottom:21px;">
    <div class="card stat" style="padding:19px;display:flex;gap:14px;align-items:center;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
      <div class="stat-icon" style="width:45px;height:45px;display:grid;place-items:center;border-radius:12px;background:#5865f224;color:#9ba3ff;font-size:19px;"><i class="fa-solid fa-database"></i></div>
      <div><b style="display:block;font-size:24px;line-height:1.1;color:var(--text);">${totalAccounts}</b><span style="font-size:13px;color:var(--muted);">${isEn ? 'Total Accounts' : 'Accounts total'}</span></div>
    </div>
    <div class="card stat" style="padding:19px;display:flex;gap:14px;align-items:center;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
      <div class="stat-icon" style="width:45px;height:45px;display:grid;place-items:center;border-radius:12px;background:#55df9020;color:var(--green);font-size:19px;"><i class="fa-solid fa-circle-check"></i></div>
      <div><b style="display:block;font-size:24px;line-height:1.1;color:var(--green);">${availableAccounts}</b><span style="font-size:13px;color:var(--muted);">${isEn ? 'Available' : 'Verfügbar'}</span></div>
    </div>
    <div class="card stat" style="padding:19px;display:flex;gap:14px;align-items:center;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
      <div class="stat-icon" style="width:45px;height:45px;display:grid;place-items:center;border-radius:12px;background:#5865f224;color:#9ba3ff;font-size:19px;"><i class="fa-solid fa-users"></i></div>
      <div><b style="display:block;font-size:24px;line-height:1.1;color:var(--text);">${totalUsers}</b><span style="font-size:13px;color:var(--muted);">${isEn ? 'Users' : 'Benutzer'}</span></div>
    </div>
    <div class="card stat" style="padding:19px;display:flex;gap:14px;align-items:center;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
      <div class="stat-icon" style="width:45px;height:45px;display:grid;place-items:center;border-radius:12px;background:#ffd07830;color:#ffd078;font-size:19px;"><i class="fa-solid fa-ticket"></i></div>
      <div><b style="display:block;font-size:24px;line-height:1.1;color:#ffd078;">${totalLicenses}</b><span style="font-size:13px;color:var(--muted);">${isEn ? 'Licenses' : 'Lizenzen'}</span></div>
    </div>
  </div>
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;"><span><i class="fa-solid fa-server" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'Services' : 'Services'}</span></div>
    <div class="services" id="service-container" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:15px;">${d.services.map(s => `
      <div class="service-card card" style="padding:20px;overflow:hidden;position:relative;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
        <h3 style="position:relative;margin:0;font-size:18px;color:var(--text);">${s.name}</h3>
        <span class="stock" style="display:block;margin:10px 0 16px;color:var(--muted);">${isEn ? 'Stock' : 'Stock'}: <b style="font-size:20px;color:var(--green);">${s.stock}</b></span>
        <button class="btn" onclick="window.restockService(${s.id})" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;width:100%;position:relative;z-index:1;">${isEn ? 'Restock' : 'Auffüllen'} <i class="fa-solid fa-plus" style="color:var(--green);"></i></button>
        <button class="btn ghost" onclick="window.deleteService(${s.id})" style="margin-top:8px;border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;width:100%;"><i class="fa-solid fa-trash" style="color:var(--red);"></i></button>
      </div>
    `).join('')}</div>
    <button class="btn" onclick="window.showAddServiceModal()" style="margin-top:15px;border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;"><i class="fa-solid fa-plus" style="color:var(--green);"></i> ${isEn ? 'Add Service' : 'Service hinzufügen'}</button>
  </div>`;
}

// ============================================================
// ACCOUNTS
// ============================================================
let accountPage = 1;
let accountSearchTerm = '';
const ACCOUNTS_PER_PAGE = 5;

function accounts(d) {
  const isEn = prefs().language === 'en';
  
  let filtered = d.accounts;
  if (accountSearchTerm.trim()) {
    const term = accountSearchTerm.toLowerCase();
    filtered = d.accounts.filter(a => 
      a.credential.toLowerCase().includes(term) ||
      (d.services.find(s => s.id === a.service_id)?.name || '').toLowerCase().includes(term)
    );
  }
  
  const available = filtered.filter(a => a.status === 'available');
  const taken = filtered.filter(a => a.status === 'taken');
  const blacklisted = filtered.filter(a => a.status === 'blacklisted');
  
  const sortedAvailable = available.sort((a,b) => {
    const sa = d.services.find(s => s.id === a.service_id);
    const sb = d.services.find(s => s.id === b.service_id);
    return (sa?.name || '').localeCompare(sb?.name || '');
  });
  
  const totalPages = Math.ceil(sortedAvailable.length / ACCOUNTS_PER_PAGE);
  if (accountPage > totalPages) accountPage = Math.max(1, totalPages);
  const start = (accountPage - 1) * ACCOUNTS_PER_PAGE;
  const pageItems = sortedAvailable.slice(start, start + ACCOUNTS_PER_PAGE);
  
  return `
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;flex-wrap:wrap;">
      <span><i class="fa-solid fa-key" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'Available Accounts' : 'Verfügbare Accounts'}</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input id="account-search" type="text" placeholder="${isEn ? 'Search accounts...' : 'Accounts durchsuchen...'}" value="${esc(accountSearchTerm)}" style="border:1px solid var(--line);border-radius:8px;padding:8px 12px;color:var(--text);background:#151520;outline:0;width:180px;">
        <button class="btn" onclick="window.searchAccounts()" style="border:0;border-radius:8px;padding:8px 14px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer;"><i class="fa-solid fa-search"></i></button>
        <button class="btn" onclick="window.resetSearch()" style="border:0;border-radius:8px;padding:8px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;cursor:pointer;">${isEn ? 'Reset' : 'Zurücksetzen'}</button>
        <button class="btn" onclick="window.showAddAccountModal()" style="border:0;border-radius:8px;padding:8px 14px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer;"><i class="fa-solid fa-plus" style="color:var(--green);"></i> ${isEn ? 'Add Account' : 'Account hinzufügen'}</button>
      </div>
    </div>
    <div class="table-wrap" style="overflow:auto;">
      <table class="data-table" style="width:100%;border-collapse:collapse;white-space:nowrap;">
        <thead><tr><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Service' : 'Service'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Credential' : 'Credential'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Status' : 'Status'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Actions' : 'Aktionen'}</th></tr></thead>
        <tbody>${pageItems.length === 0 ? `<tr><td colspan="4" class="empty" style="padding:25px;color:var(--muted);text-align:center;">${isEn ? 'No available accounts.' : 'Keine verfügbaren Accounts.'}</td></tr>` : 
          pageItems.map(a => {
            const service = d.services.find(s => s.id === a.service_id);
            return `<tr>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;color:var(--text);">${service ? service.name : 'Unbekannt'}</td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;"><code style="padding:8px;border-radius:7px;background:#12121d;color:#bdc4ff;word-break:break-all;">${esc(a.credential)}</code></td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;"><span class="badge available" style="display:inline-block;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:800;color:#89efad;background:#55df9020;">available</span></td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;">
                <button class="icon-btn" onclick="window.deleteAccount(${a.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;"><i class="fa-solid fa-trash" style="color:var(--red);"></i></button>
                <button class="icon-btn" onclick="window.blacklistAccount(${a.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;"><i class="fa-solid fa-ban" style="color:var(--red);"></i></button>
              </td>
            </tr>`;
          }).join('')
        }</tbody>
      </table>
      ${totalPages > 1 ? `<div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">
        <button class="btn ghost" onclick="window.accountPage = Math.max(1, window.accountPage - 1); render();" ${accountPage <= 1 ? 'disabled' : ''} style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;">◀</button>
        <span style="padding:8px 12px;background:var(--panel);border-radius:8px;color:var(--text);">${accountPage} / ${totalPages}</span>
        <button class="btn ghost" onclick="window.accountPage = Math.min(${totalPages}, window.accountPage + 1); render();" ${accountPage >= totalPages ? 'disabled' : ''} style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;">▶</button>
      </div>` : ''}
    </div>
  </div>
  
  <div class="card section" style="padding:21px;margin-top:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;"><span><i class="fa-solid fa-clock" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'Taken Accounts' : 'Vergebene Accounts'}</span></div>
    <div class="table-wrap" style="overflow:auto;">
      <table class="data-table" style="width:100%;border-collapse:collapse;white-space:nowrap;">
        <thead><tr><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Service' : 'Service'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Credential' : 'Credential'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Status' : 'Status'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Actions' : 'Aktionen'}</th></tr></thead>
        <tbody>${taken.length === 0 ? `<tr><td colspan="4" class="empty" style="padding:25px;color:var(--muted);text-align:center;">${isEn ? 'No taken accounts.' : 'Keine vergebenen Accounts.'}</td></tr>` :
          taken.slice(0, 20).map(a => {
            const service = d.services.find(s => s.id === a.service_id);
            return `<tr>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;color:var(--text);">${service ? service.name : 'Unbekannt'}</td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;"><code style="padding:8px;border-radius:7px;background:#12121d;color:#bdc4ff;word-break:break-all;">${esc(a.credential)}</code></td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;"><span class="badge taken" style="display:inline-block;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:800;color:#ffa0ad;background:#ff789020;">taken</span></td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;">
                <button class="icon-btn" onclick="window.deleteAccount(${a.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;"><i class="fa-solid fa-trash" style="color:var(--red);"></i></button>
                <button class="icon-btn" onclick="window.blacklistAccount(${a.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;"><i class="fa-solid fa-ban" style="color:var(--red);"></i></button>
              </td>
            </tr>`;
          }).join('')
        }</tbody>
      </table>
    </div>
  </div>
  
  <div class="card section" style="padding:21px;margin-top:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;"><span><i class="fa-solid fa-ban" style="color:var(--red);margin-right:7px;"></i> ${isEn ? 'Blacklisted Accounts' : 'Geblacklistete Accounts'}</span></div>
    <div class="table-wrap" style="overflow:auto;">
      <table class="data-table" style="width:100%;border-collapse:collapse;white-space:nowrap;">
        <thead><tr><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Service' : 'Service'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Credential' : 'Credential'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Status' : 'Status'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Actions' : 'Aktionen'}</th></tr></thead>
        <tbody>${blacklisted.length === 0 ? `<tr><td colspan="4" class="empty" style="padding:25px;color:var(--muted);text-align:center;">${isEn ? 'No blacklisted accounts.' : 'Keine geblacklisteten Accounts.'}</td></tr>` :
          blacklisted.slice(0, 20).map(a => {
            const service = d.services.find(s => s.id === a.service_id);
            return `<tr>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;color:var(--text);">${service ? service.name : 'Unbekannt'}</td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;"><code style="padding:8px;border-radius:7px;background:#12121d;color:#bdc4ff;word-break:break-all;">${esc(a.credential)}</code></td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;"><span class="badge taken" style="display:inline-block;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:800;color:#ff7890;background:#ff789030;">blacklisted</span></td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;">
                <button class="icon-btn" onclick="window.unblacklistAccount(${a.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;"><i class="fa-solid fa-check" style="color:var(--green);"></i></button>
              </td>
            </tr>`;
          }).join('')
        }</tbody>
      </table>
    </div>
  </div>`;
}

// ============================================================
// USERS
// ============================================================
let userSearchTerm = '';
let userPage = 1;
const USERS_PER_PAGE = 15;

function users(d) {
  const isEn = prefs().language === 'en';
  
  let filtered = d.users;
  if (userSearchTerm.trim()) {
    const term = userSearchTerm.toLowerCase();
    filtered = d.users.filter(u => 
      u.username.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );
  }
  
  filtered = filtered.sort((a, b) => a.username.localeCompare(b.username));
  
  const totalPages = Math.ceil(filtered.length / USERS_PER_PAGE);
  if (userPage > totalPages) userPage = Math.max(1, totalPages);
  const start = (userPage - 1) * USERS_PER_PAGE;
  const pageItems = filtered.slice(start, start + USERS_PER_PAGE);
  
  let paginationHTML = '';
  if (totalPages > 1) {
    paginationHTML = `<div style="display:flex;gap:8px;margin-top:12px;justify-content:center;flex-wrap:wrap;">
      <button class="btn ghost" onclick="window.userPage = Math.max(1, window.userPage - 1); render();" ${userPage <= 1 ? 'disabled' : ''} style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;${userPage <= 1 ? 'opacity:0.4;cursor:not-allowed;' : ''}">◀</button>
      <span style="padding:8px 12px;background:var(--panel);border-radius:8px;color:var(--text);">${userPage} / ${totalPages}</span>
      <button class="btn ghost" onclick="window.userPage = Math.min(${totalPages}, window.userPage + 1); render();" ${userPage >= totalPages ? 'disabled' : ''} style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;${userPage >= totalPages ? 'opacity:0.4;cursor:not-allowed;' : ''}">▶</button>
    </div>`;
  }
  
  return `
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;flex-wrap:wrap;">
      <span><i class="fa-solid fa-users" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'Manage Users' : 'Benutzer verwalten'} (${d.users.length})</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input id="user-search" type="text" placeholder="${isEn ? 'Search users...' : 'Benutzer durchsuchen...'}" value="${esc(userSearchTerm)}" style="border:1px solid var(--line);border-radius:8px;padding:8px 12px;color:var(--text);background:#151520;outline:0;width:180px;">
        <button class="btn" onclick="window.searchUsers()" style="border:0;border-radius:8px;padding:8px 14px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer;"><i class="fa-solid fa-search"></i></button>
        <button class="btn" onclick="window.resetUserSearch()" style="border:0;border-radius:8px;padding:8px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;cursor:pointer;">${isEn ? 'Reset' : 'Zurücksetzen'}</button>
        <button class="btn" onclick="window.showAddUserModal()" style="border:0;border-radius:8px;padding:8px 14px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer;"><i class="fa-solid fa-plus" style="color:var(--green);"></i> ${isEn ? 'Add User' : 'Benutzer hinzufügen'}</button>
      </div>
    </div>
    <div class="table-wrap" style="overflow:auto;">
      <table class="data-table" style="width:100%;border-collapse:collapse;white-space:nowrap;">
        <thead><tr><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Username' : 'Benutzername'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'License' : 'Lizenz'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Role' : 'Rolle'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Limit' : 'Limit'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Actions' : 'Aktionen'}</th></tr></thead>
        <tbody>${pageItems.length === 0 ? `<tr><td colspan="5" class="empty" style="padding:25px;color:var(--muted);text-align:center;">${isEn ? 'No users found.' : 'Keine Benutzer gefunden.'}</td></tr>` :
          pageItems.map(u => {
            const isBlacklisted = u.blacklisted || false;
            return `<tr>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;color:var(--text);">${esc(u.username)}</td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;color:var(--text);"><span style="color:${u.license_key ? 'var(--green)' : 'var(--muted)'};">${u.license_key || '❌'}</span></td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;"><span class="badge ${u.role === 'admin' ? 'available' : ''}" style="display:inline-block;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:800;${u.role === 'admin' ? 'color:#89efad;background:#55df9020;' : 'color:#ffa0ad;background:#ff789020;'}">${u.role}</span></td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;color:var(--text);">${u.daily_limit || 0}</td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;">
                ${isBlacklisted ? `<button class="icon-btn" onclick="window.unblacklistUser(${u.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;"><i class="fa-solid fa-check" style="color:var(--green);"></i></button>` : `<button class="icon-btn" onclick="window.blacklistUser(${u.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;"><i class="fa-solid fa-ban" style="color:var(--red);"></i></button>`}
                <button class="icon-btn" onclick="window.assignLicense(${u.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;" title="${isEn ? 'Assign License' : 'Lizenz zuweisen'}"><i class="fa-solid fa-ticket" style="color:var(--blue);"></i></button>
                <button class="icon-btn" onclick="window.revokeLicense(${u.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;" title="${isEn ? 'Revoke License' : 'Lizenz entziehen'}"><i class="fa-solid fa-ban" style="color:var(--red);"></i></button>
                <button class="icon-btn" onclick="window.deleteUser(${u.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;"><i class="fa-solid fa-trash" style="color:var(--red);"></i></button>
              </td>
            </tr>`;
          }).join('')
        }</tbody>
      </table>
      ${paginationHTML}
    </div>
  </div>`;
}

// ============================================================
// LICENSES (Admin) - MIT ZUWEISUNGSFUNKTION
// ============================================================
function licenses(d) {
  const isEn = prefs().language === 'en';
  
  return `
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;flex-wrap:wrap;">
      <span><i class="fa-solid fa-ticket" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'License Keys' : 'Lizenzschlüssel'}</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn" onclick="window.showAddLicenseModal()" style="border:0;border-radius:8px;padding:8px 14px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer;"><i class="fa-solid fa-plus" style="color:var(--green);"></i> ${isEn ? 'Create License' : 'Lizenz erstellen'}</button>
        <button class="btn ghost" onclick="window.showAssignLicenseModal()" style="border:0;border-radius:8px;padding:8px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;cursor:pointer;"><i class="fa-solid fa-user-plus"></i> ${isEn ? 'Assign to User' : 'User zuweisen'}</button>
      </div>
    </div>
    <div class="table-wrap" style="overflow:auto;">
      <table class="data-table" style="width:100%;border-collapse:collapse;white-space:nowrap;">
        <thead><tr><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Key' : 'Schlüssel'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Type' : 'Typ'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Limit' : 'Limit'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Assigned To' : 'Zugewiesen an'}</th><th style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;">${isEn ? 'Actions' : 'Aktionen'}</th></tr></thead>
        <tbody>${d.licenses.length === 0 ? `<tr><td colspan="5" class="empty" style="padding:25px;color:var(--muted);text-align:center;">${isEn ? 'No licenses created.' : 'Keine Lizenzen erstellt.'}</td></tr>` :
          d.licenses.map(l => {
            const user = d.users.find(u => u.license_key === l.key);
            return `<tr>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;color:var(--text);"><code style="padding:4px 8px;border-radius:4px;background:#12121d;color:#bdc4ff;font-size:12px;">${esc(l.key)}</code></td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;color:var(--text);"><span class="badge" style="display:inline-block;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:800;${l.type === 'lifetime' ? 'color:#89efad;background:#55df9020;' : 'color:#ffd078;background:#ffd07830;'}">${l.type}</span></td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;color:var(--text);">${l.daily_limit || 50}</td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;color:var(--text);">${user ? esc(user.username) : '❌'}</td>
              <td style="padding:12px 10px;text-align:left;border-bottom:1px solid #55557075;">
                <button class="icon-btn" onclick="window.deleteLicense(${l.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;"><i class="fa-solid fa-trash" style="color:var(--red);"></i></button>
                ${user ? `<button class="icon-btn" onclick="window.revokeLicenseFromUser(${user.id})" style="border:0;background:transparent;padding:7px;color:var(--muted);cursor:pointer;" title="${isEn ? 'Revoke from user' : 'User entziehen'}"><i class="fa-solid fa-ban" style="color:var(--red);"></i></button>` : ''}
              </td>
            </tr>`;
          }).join('')
        }</tbody>
      </table>
    </div>
  </div>`;
}

// ============================================================
// LICENSE MANAGEMENT - ADMIN ZUWEISUNG
// ============================================================
window.showAssignLicenseModal = () => {
  const d = load();
  const isEn = prefs().language === 'en';
  
  const availableLicenses = d.licenses.filter(l => {
    const user = d.users.find(u => u.license_key === l.key);
    return !user;
  });
  
  const usersWithoutLicense = d.users.filter(u => !u.license_key);
  
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:#05050bbd;backdrop-filter:blur(5px);z-index:9;';
  modal.innerHTML = `
    <div class="modal card" style="width:min(100%,430px);padding:24px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
      <h2 style="margin:0 0 7px;color:var(--text);">${isEn ? 'Assign License to User' : 'Lizenz an User zuweisen'}</h2>
      <form id="assign-license-form">
        <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'License Key' : 'Lizenzschlüssel'}</span>
          <select name="license_key" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;">
            ${availableLicenses.length === 0 ? '<option value="">' + (isEn ? 'No available licenses' : 'Keine verfügbaren Lizenzen') + '</option>' :
              availableLicenses.map(l => `<option value="${l.key}">${l.key} (${l.daily_limit} ${isEn ? 'accounts/day' : 'Accounts/Tag'})</option>`).join('')}
          </select>
        </label>
        <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'User' : 'Benutzer'}</span>
          <select name="user_id" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;">
            ${usersWithoutLicense.length === 0 ? '<option value="">' + (isEn ? 'No users without license' : 'Keine User ohne Lizenz') + '</option>' :
              usersWithoutLicense.map(u => `<option value="${u.id}">${u.username} (${u.role})</option>`).join('')}
          </select>
        </label>
        <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:9px;margin-top:12px;">
          <button type="button" class="btn ghost" onclick="this.closest('.modal-backdrop').remove()" style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Cancel' : 'Abbrechen'}</button>
          <button class="btn" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Assign' : 'Zuweisen'}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('#assign-license-form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const licenseKey = f.get('license_key');
    const userId = parseInt(f.get('user_id'));
    
    if (!licenseKey || !userId) {
      return toast(isEn ? 'Please select both license and user.' : 'Bitte wähle Lizenz und User aus.');
    }
    
    const user = d.users.find(u => u.id === userId);
    if (user) {
      const license = d.licenses.find(l => l.key === licenseKey);
      user.license_key = licenseKey;
      user.license_type = license.type;
      user.daily_limit = license.daily_limit;
      user.used_today = 0;
      save(d);
      log(d, `License ${licenseKey} assigned to ${user.username}`, current().username);
      toast(`✅ ${isEn ? 'License assigned!' : 'Lizenz zugewiesen!'}`);
      render();
      modal.remove();
    }
  };
};

window.revokeLicenseFromUser = (userId) => {
  const d = load();
  const isEn = prefs().language === 'en';
  const user = d.users.find(u => u.id === userId);
  if (user && user.license_key) {
    if (!confirm(isEn ? `Revoke license from ${user.username}?` : `Lizenz von ${user.username} entziehen?`)) return;
    const licenseKey = user.license_key;
    user.license_key = null;
    user.license_type = null;
    user.daily_limit = 0;
    user.used_today = 0;
    save(d);
    log(d, `License ${licenseKey} revoked from ${user.username}`, current().username);
    toast(`✅ ${isEn ? 'License revoked!' : 'Lizenz entzogen!'}`);
    render();
  }
};

window.assignLicense = (userId) => {
  const d = load();
  const isEn = prefs().language === 'en';
  const user = d.users.find(u => u.id === userId);
  if (!user) return;
  
  const availableLicenses = d.licenses.filter(l => {
    const userWithLicense = d.users.find(u => u.license_key === l.key);
    return !userWithLicense;
  });
  
  if (availableLicenses.length === 0) {
    return toast(isEn ? 'No available licenses.' : 'Keine verfügbaren Lizenzen.');
  }
  
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:#05050bbd;backdrop-filter:blur(5px);z-index:9;';
  modal.innerHTML = `
    <div class="modal card" style="width:min(100%,430px);padding:24px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
      <h2 style="margin:0 0 7px;color:var(--text);">${isEn ? 'Assign License to' : 'Lizenz zuweisen an'} ${esc(user.username)}</h2>
      <form id="quick-assign-form">
        <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'License Key' : 'Lizenzschlüssel'}</span>
          <select name="license_key" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;">
            ${availableLicenses.map(l => `<option value="${l.key}">${l.key} (${l.daily_limit} ${isEn ? 'accounts/day' : 'Accounts/Tag'})</option>`).join('')}
          </select>
        </label>
        <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:9px;margin-top:12px;">
          <button type="button" class="btn ghost" onclick="this.closest('.modal-backdrop').remove()" style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Cancel' : 'Abbrechen'}</button>
          <button class="btn" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Assign' : 'Zuweisen'}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('#quick-assign-form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const licenseKey = f.get('license_key');
    
    const license = d.licenses.find(l => l.key === licenseKey);
    if (user && license) {
      user.license_key = licenseKey;
      user.license_type = license.type;
      user.daily_limit = license.daily_limit;
      user.used_today = 0;
      save(d);
      log(d, `License ${licenseKey} assigned to ${user.username}`, current().username);
      toast(`✅ ${isEn ? 'License assigned!' : 'Lizenz zugewiesen!'}`);
      render();
      modal.remove();
    }
  };
};

window.revokeLicense = (userId) => {
  const d = load();
  const isEn = prefs().language === 'en';
  const user = d.users.find(u => u.id === userId);
  if (user && user.license_key) {
    if (!confirm(isEn ? `Revoke license from ${user.username}?` : `Lizenz von ${user.username} entziehen?`)) return;
    const licenseKey = user.license_key;
    user.license_key = null;
    user.license_type = null;
    user.daily_limit = 0;
    user.used_today = 0;
    save(d);
    log(d, `License ${licenseKey} revoked from ${user.username}`, current().username);
    toast(`✅ ${isEn ? 'License revoked!' : 'Lizenz entzogen!'}`);
    render();
  } else {
    toast(isEn ? 'User has no license.' : 'User hat keine Lizenz.');
  }
};

// ============================================================
// CHANGELOG
// ============================================================
function changes(d, admin) {
  const isEn = prefs().language === 'en';
  
  const formatMessage = (msg) => {
    if (!msg) return '';
    let formatted = msg;
    formatted = formatted.replace(/\+(?!\s)([^+\-*]+)/g, function(match, content) {
      return '<span class="plus">+' + content + '</span>';
    });
    formatted = formatted.replace(/-(?!\s)([^+\-*]+)/g, function(match, content) {
      return '<span class="minus">-' + content + '</span>';
    });
    formatted = formatted.replace(/\*(?!\s)([^+\-*]+)/g, function(match, content) {
      return '<span class="star">*' + content + '</span>';
    });
    return formatted;
  };
  
  return `
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;">
      <span><i class="fa-solid fa-clock-rotate-left" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'Changelog' : 'Änderungen'}</span>
      ${admin ? `<button class="btn" onclick="window.showAddChangelogModal()" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;"><i class="fa-solid fa-plus" style="color:var(--green);"></i> ${isEn ? 'Add Entry' : 'Eintrag hinzufügen'}</button>` : ''}
    </div>
    ${d.changelog.length === 0 ? `<div class="empty" style="padding:25px;color:var(--muted);text-align:center;">${isEn ? 'No entries.' : 'Keine Einträge.'}</div>` :
      d.changelog.slice().reverse().map(c => `
        <div class="change" style="padding:13px 0;border-bottom:1px solid #55557075;white-space:pre-wrap;color:#8dd8ff;font-size:15px;">
          ${formatMessage(c.message)}
          <span class="meta" style="display:block;margin-top:5px;color:var(--muted);font-size:12px;">${c.timestamp || new Date().toLocaleString('de-DE')} · ${esc(c.user || 'System')}</span>
        </div>
      `).join('')
    }</div>`;
}

// ============================================================
// LOGS
// ============================================================
function logs(d) {
  const isEn = prefs().language === 'en';
  return `
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;"><span><i class="fa-solid fa-list" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'System Logs' : 'System-Protokolle'}</span></div>
    <div class="logs" style="display:grid;gap:8px;">${d.logs.length === 0 ? `<div class="empty" style="padding:25px;color:var(--muted);text-align:center;">${isEn ? 'No logs.' : 'Keine Logs.'}</div>` :
      d.logs.slice(0, 50).map(l => `
        <div class="log" style="padding:11px 13px;border-radius:9px;background:#141420;color:#e5e6fa;">
          ${esc(l.action)}
          <time style="display:block;margin-top:3px;color:var(--muted);font-size:12px;">${l.timestamp || new Date().toLocaleString('de-DE')} · ${esc(l.user || 'System')}</time>
        </div>
      `).join('')
    }</div>
  </div>`;
}

// ============================================================
// HOME (User Dashboard)
// ============================================================
function home(d, user) {
  const isEn = prefs().language === 'en';
  const availableAccounts = d.accounts.filter(a => a.status === 'available' && a.status !== 'blacklisted');
  
  const hasLicense = user.license_key && user.license_key !== null;
  
  const formatMessage = (msg) => {
    if (!msg) return '';
    let formatted = msg;
    formatted = formatted.replace(/\+(?!\s)([^+\-*]+)/g, function(match, content) {
      return '<span class="plus">+' + content + '</span>';
    });
    formatted = formatted.replace(/-(?!\s)([^+\-*]+)/g, function(match, content) {
      return '<span class="minus">-' + content + '</span>';
    });
    formatted = formatted.replace(/\*(?!\s)([^+\-*]+)/g, function(match, content) {
      return '<span class="star">*' + content + '</span>';
    });
    return formatted;
  };
  
  const restockLogs = d.logs.filter(log => 
    log.action && log.action.toLowerCase().includes('restocked')
  ).slice(0, 10);
  
  return `
  <div class="grid-stats" style="display:grid;grid-template-columns:repeat(2,1fr);gap:15px;margin-bottom:21px;">
    <div class="card stat" style="padding:19px;display:flex;gap:14px;align-items:center;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
      <div class="stat-icon" style="width:45px;height:45px;display:grid;place-items:center;border-radius:12px;background:#55df9020;color:var(--green);font-size:19px;"><i class="fa-solid fa-circle-check"></i></div>
      <div><b style="display:block;font-size:24px;line-height:1.1;color:var(--green);">${availableAccounts.length}</b><span style="font-size:13px;color:var(--muted);">${isEn ? 'Available Accounts' : 'Verfügbare Accounts'}</span></div>
    </div>
    <div class="card stat" style="padding:19px;display:flex;gap:14px;align-items:center;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
      <div class="stat-icon" style="width:45px;height:45px;display:grid;place-items:center;border-radius:12px;background:#${hasLicense ? '55df9020' : '5865f224'};color:${hasLicense ? 'var(--green)' : '#9ba3ff'};font-size:19px;"><i class="fa-solid ${hasLicense ? 'fa-check-circle' : 'fa-ticket'}"></i></div>
      <div><b style="display:block;font-size:24px;line-height:1.1;color:${hasLicense ? 'var(--green)' : 'var(--text)'};">${hasLicense ? '✅ Active' : '❌ No License'}</b><span style="font-size:13px;color:var(--muted);">${hasLicense ? `${user.daily_limit || 0} ${isEn ? 'accounts/day' : 'Accounts/Tag'}` : isEn ? 'Contact admin' : 'Admin kontaktieren'}</span></div>
    </div>
  </div>
  
  ${hasLicense ? `
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;">
      <span><i class="fa-solid fa-gift" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'Claim Accounts' : 'Accounts abholen'}</span>
      <span style="font-size:13px;color:var(--muted);">${isEn ? 'Used' : 'Verwendet'}: ${user.used_today || 0}/${user.daily_limit || 0}</span>
    </div>
    ${availableAccounts.length === 0 ? `<div class="empty" style="padding:25px;color:var(--muted);text-align:center;">${isEn ? 'No accounts available.' : 'Keine Accounts verfügbar.'}</div>` :
      `<div class="services" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:15px;">${d.services.filter(s => s.stock > 0).sort((a,b) => a.name.localeCompare(b.name)).map(s => `
        <div class="service-card card" style="padding:20px;overflow:hidden;position:relative;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
          <h3 style="position:relative;margin:0;font-size:18px;color:var(--text);">${s.name}</h3>
          <span class="stock" style="display:block;margin:10px 0 16px;color:var(--muted);">${isEn ? 'Stock' : 'Stock'}: <b style="font-size:20px;color:var(--green);">${s.stock}</b></span>
          <button class="btn" onclick="window.claimAccount(${s.id})" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;width:100%;position:relative;z-index:1;">${isEn ? 'Claim' : 'Abholen'} <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      `).join('')}</div>`
    }</div>
  ` : `
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;">
      <span><i class="fa-solid fa-ticket" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'No License Assigned' : 'Keine Lizenz zugewiesen'}</span>
    </div>
    <div class="empty" style="padding:25px;color:var(--muted);text-align:center;">
      <p>${isEn ? 'You don\'t have a license yet. Please contact an admin.' : 'Du hast noch keine Lizenz. Bitte kontaktiere einen Admin.'}</p>
    </div>
  </div>
  `}
  
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;">
      <span><i class="fa-solid fa-clock-rotate-left" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'Changelog' : 'Änderungen'}</span>
    </div>
    ${d.changelog.length === 0 ? `<div class="empty" style="padding:25px;color:var(--muted);text-align:center;">${isEn ? 'No entries.' : 'Keine Einträge.'}</div>` :
      d.changelog.slice().reverse().slice(0, 5).map(c => `
        <div class="change" style="padding:13px 0;border-bottom:1px solid #55557075;white-space:pre-wrap;color:#8dd8ff;font-size:15px;">
          ${formatMessage(c.message)}
          <span class="meta" style="display:block;margin-top:5px;color:var(--muted);font-size:12px;">${c.timestamp || new Date().toLocaleString('de-DE')} · ${esc(c.user || 'System')}</span>
        </div>
      `).join('')
    }</div>
  
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;">
      <span><i class="fa-solid fa-arrow-trend-up" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'Restock History' : 'Restock-Verlauf'}</span>
    </div>
    ${restockLogs.length === 0 ? `<div class="empty" style="padding:25px;color:var(--muted);text-align:center;">${isEn ? 'No restocks yet.' : 'Noch keine Restocks.'}</div>` :
      restockLogs.map(log => `
        <div class="change" style="padding:13px 0;border-bottom:1px solid #55557075;white-space:pre-wrap;color:#8dd8ff;font-size:15px;">
          <span style="color:var(--green);">🔄</span> ${esc(log.action)}
          <span class="meta" style="display:block;margin-top:5px;color:var(--muted);font-size:12px;">${log.timestamp || new Date().toLocaleString('de-DE')} · ${esc(log.user || 'System')}</span>
        </div>
      `).join('')
    }</div>
</div>
  `;
}

// ============================================================
// SETTINGS
// ============================================================
function settingsPage() {
  const p = prefs();
  const isEn = p.language === 'en';
  
  return `
  <div class="card section" style="padding:21px;margin-bottom:20px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px;font-size:17px;"><span><i class="fa-solid fa-gear" style="color:#a2a9ff;margin-right:7px;"></i> ${isEn ? 'Settings' : 'Einstellungen'}</span></div>
    <div class="settings-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
      <div class="field" style="display:block;margin:14px 0;">
        <span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Language' : 'Sprache'}</span>
        <select id="language-select" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;">
          <option value="en" ${p.language === 'en' ? 'selected' : ''}>English</option>
          <option value="de" ${p.language === 'de' ? 'selected' : ''}>Deutsch</option>
        </select>
      </div>
      <div class="field" style="display:block;margin:14px 0;">
        <span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Primary Color' : 'Primärfarbe'}</span>
        <input type="color" value="${p.primaryColor}" id="primary-color" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:4px;color:var(--text);background:#151520;outline:0;height:40px;cursor:pointer;">
      </div>
      <div class="field" style="display:block;margin:14px 0;">
        <span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Secondary Color' : 'Sekundärfarbe'}</span>
        <input type="color" value="${p.secondaryColor}" id="secondary-color" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:4px;color:var(--text);background:#151520;outline:0;height:40px;cursor:pointer;">
      </div>
      <div class="field" style="display:block;margin:14px 0;">
        <span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Particles' : 'Partikel'}</span>
        <input type="range" min="5" max="80" value="${p.particles}" id="particle-count" style="width:100%;accent-color:var(--blue);">
        <span class="range-value" style="float:right;color:#aeb5ff;">${p.particles}</span>
      </div>
      <div class="field" style="display:block;margin:14px 0;">
        <span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Particle Type' : 'Partikel-Typ'}</span>
        <select id="particle-type" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;">
          ${['dot', 'square', 'line', 'ring', 'star'].map(t => `<option value="${t}" ${p.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="display:block;margin:14px 0;">
        <span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Motion' : 'Bewegung'}</span>
        <select id="particle-motion" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;">
          ${['float', 'spin', 'pulse', 'still'].map(m => `<option value="${m}" ${p.motion === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="display:block;margin:14px 0;">
        <span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Volume' : 'Lautstärke'}</span>
        <input type="range" min="0" max="100" value="${p.volume}" id="volume" style="width:100%;accent-color:var(--blue);">
        <span class="range-value" style="float:right;color:#aeb5ff;">${p.volume}%</span>
      </div>
      <div class="field" style="display:block;margin:14px 0;grid-column:span 2;">
        <label style="display:inline-flex;align-items:center;gap:8px;margin-right:20px;cursor:pointer;color:var(--text);">
          <input type="checkbox" ${p.menuSounds ? 'checked' : ''} id="menu-sounds" style="accent-color:var(--blue);width:18px;height:18px;cursor:pointer;"> ${isEn ? 'Menu Sounds' : 'Menü-Sounds'}
        </label>
        <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;color:var(--text);">
          <input type="checkbox" ${p.autoCopy ? 'checked' : ''} id="auto-copy" style="accent-color:var(--blue);width:18px;height:18px;cursor:pointer;"> ${isEn ? 'Auto Copy' : 'Auto-Kopieren'}
        </label>
      </div>
    </div>
  </div>`;
}

// ============================================================
// MODAL FÜR CLAIM
// ============================================================
function showClaimModal(credential, serviceName) {
  const isEn = prefs().language === 'en';
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:#05050bbd;backdrop-filter:blur(5px);z-index:9;';
  modal.innerHTML = `
    <div class="modal card" style="width:min(100%,430px);padding:24px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
      <h2 style="margin:0 0 7px;color:var(--text);">${isEn ? 'Account Details' : 'Account-Details'}</h2>
      <p style="color:var(--muted);margin:0 0 12px;">${serviceName}</p>
      <div class="credential" id="claim-credential" style="padding:14px;margin:17px 0;border:1px solid var(--line);border-radius:10px;background:#11111c;color:#c4c9ff;font-family:ui-monospace,monospace;word-break:break-all;cursor:pointer;">${esc(credential)}</div>
      <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:9px;">
        <button class="btn" id="copy-claim-btn" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;"><i class="fa-solid fa-copy"></i> ${isEn ? 'Copy' : 'Kopieren'}</button>
        <button class="btn ghost" onclick="this.closest('.modal-backdrop').remove()" style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Close' : 'Schließen'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  document.querySelector('#claim-credential').onclick = () => {
    const text = document.querySelector('#claim-credential').textContent;
    if (prefs().autoCopy) {
      navigator.clipboard?.writeText(text).then(() => {
        toast(isEn ? '✅ Copied!' : '✅ Kopiert!');
      }).catch(() => {
        const range = document.createRange();
        range.selectNode(document.querySelector('#claim-credential'));
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        toast(isEn ? '✅ Copied!' : '✅ Kopiert!');
      });
    } else {
      const range = document.createRange();
      range.selectNode(document.querySelector('#claim-credential'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand('copy');
      toast(isEn ? '✅ Copied!' : '✅ Kopiert!');
    }
  };
  
  document.querySelector('#copy-claim-btn').onclick = () => {
    const text = document.querySelector('#claim-credential').textContent;
    if (prefs().autoCopy) {
      navigator.clipboard?.writeText(text).then(() => {
        toast(isEn ? '✅ Copied!' : '✅ Kopiert!');
      }).catch(() => {
        const range = document.createRange();
        range.selectNode(document.querySelector('#claim-credential'));
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        toast(isEn ? '✅ Copied!' : '✅ Kopiert!');
      });
    } else {
      const range = document.createRange();
      range.selectNode(document.querySelector('#claim-credential'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand('copy');
      toast(isEn ? '✅ Copied!' : '✅ Kopiert!');
    }
  };
}

// ============================================================
// BIND FUNCTIONS
// ============================================================
function bindAdmin(d, u) {
  const isEn = prefs().language === 'en';
  
  window.searchAccounts = () => {
    const input = document.querySelector('#account-search');
    if (input) accountSearchTerm = input.value;
    accountPage = 1;
    render();
  };
  
  window.resetSearch = () => {
    accountSearchTerm = '';
    accountPage = 1;
    render();
  };
  
  window.searchUsers = () => {
    const input = document.querySelector('#user-search');
    if (input) userSearchTerm = input.value;
    userPage = 1;
    render();
  };
  
  window.resetUserSearch = () => {
    userSearchTerm = '';
    userPage = 1;
    render();
  };
  
  window.restockService = (id) => {
    sound('restock');
    const service = d.services.find(s => s.id === id);
    if (!service) return toast(isEn ? 'Service not found.' : 'Service nicht gefunden.');
    const newAccount = {
      id: id(d.accounts),
      service_id: id,
      credential: `${service.name}-${Date.now().toString(36).toUpperCase()}`,
      status: 'available',
      created: Date.now()
    };
    d.accounts.push(newAccount);
    log(d, `${service.name} restocked (1 Account)`, u.username);
    d.changelog.push({ 
      id: id(d.changelog),
      message: `+ ${service.name} restocked by ${u.username}`,
      user: u.username,
      timestamp: new Date().toLocaleString('de-DE')
    });
    save(d);
    render();
    toast(`✅ ${service.name} ${isEn ? 'restocked!' : 'aufgefüllt!'}`);
  };

  window.deleteService = (id) => {
    if (!confirm(isEn ? 'Delete this service and all its accounts?' : 'Diesen Service und alle Accounts löschen?')) return;
    const service = d.services.find(s => s.id === id);
    if (!service) return;
    d.services = d.services.filter(s => s.id !== id);
    d.accounts = d.accounts.filter(a => a.service_id !== id);
    log(d, `Service ${service.name} deleted`, u.username);
    save(d);
    render();
    sound('menu');
    toast(`🗑️ ${isEn ? 'Service deleted' : 'Service gelöscht'}`);
  };

  window.showAddServiceModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:#05050bbd;backdrop-filter:blur(5px);z-index:9;';
    modal.innerHTML = `
      <div class="modal card" style="width:min(100%,430px);padding:24px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
        <h2 style="margin:0 0 7px;color:var(--text);">${isEn ? 'Add Service' : 'Service hinzufügen'}</h2>
        <form id="add-service-form">
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Service Name' : 'Service-Name'}</span><input name="name" required style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;"></label>
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Cooldown (seconds)' : 'Cooldown (Sekunden)'}</span><input name="cooldown" type="number" value="0" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;"></label>
          <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:9px;margin-top:12px;">
            <button type="button" class="btn ghost" onclick="this.closest('.modal-backdrop').remove()" style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Cancel' : 'Abbrechen'}</button>
            <button class="btn" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Add' : 'Hinzufügen'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#add-service-form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = f.get('name');
      if (d.services.find(s => s.name === name)) {
        toast(isEn ? '❌ Service already exists.' : '❌ Service existiert bereits.');
        return;
      }
      d.services.push({
        id: id(d.services),
        name: name,
        stock: 0,
        cooldown: parseInt(f.get('cooldown')) || 0,
        image: ''
      });
      log(d, `Service ${name} added`, u.username);
      save(d);
      render();
      modal.remove();
      sound('ok');
      toast(`✅ ${isEn ? 'Service added!' : 'Service hinzugefügt!'}`);
    };
  };

  window.showAddAccountModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:#05050bbd;backdrop-filter:blur(5px);z-index:9;';
    modal.innerHTML = `
      <div class="modal card" style="width:min(100%,430px);padding:24px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
        <h2 style="margin:0 0 7px;color:var(--text);">${isEn ? 'Add Accounts' : 'Accounts hinzufügen'}</h2>
        <p style="color:var(--muted);margin:0 0 12px;">${isEn ? 'One account per line' : 'Ein Account pro Zeile'}</p>
        <form id="add-account-form">
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Service' : 'Service'}</span>
            <select name="service_id" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;">${d.services.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
          </label>
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Credentials' : 'Credentials'}</span>
            <textarea name="credentials" required placeholder="${isEn ? 'account1@example.com:password\naccount2@example.com:password' : 'account1@example.com:passwort\naccount2@example.com:passwort'}" rows="5" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;min-height:120px;resize:vertical;"></textarea>
          </label>
          <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:9px;margin-top:12px;">
            <button type="button" class="btn ghost" onclick="this.closest('.modal-backdrop').remove()" style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Cancel' : 'Abbrechen'}</button>
            <button class="btn" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Add Accounts' : 'Accounts hinzufügen'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#add-account-form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const serviceId = parseInt(f.get('service_id'));
      const credentials = f.get('credentials').split('\n').filter(line => line.trim());
      let added = 0;
      credentials.forEach(cred => {
        d.accounts.push({
          id: id(d.accounts),
          service_id: serviceId,
          credential: cred.trim(),
          status: 'available',
          created: Date.now()
        });
        added++;
      });
      const service = d.services.find(s => s.id === serviceId);
      log(d, `${added} accounts added to ${service ? service.name : 'Service'}`, u.username);
      save(d);
      render();
      modal.remove();
      sound('ok');
      toast(`✅ ${added} ${isEn ? 'accounts added!' : 'Accounts hinzugefügt!'}`);
    };
  };

  window.deleteAccount = (id) => {
    const idx = d.accounts.findIndex(a => a.id === id);
    if (idx > -1) {
      const acc = d.accounts[idx];
      d.accounts.splice(idx, 1);
      log(d, `Account ${acc.credential} deleted`, u.username);
      save(d);
      render();
      sound('menu');
      toast('🗑️ ' + (isEn ? 'Account deleted' : 'Account gelöscht'));
    }
  };

  window.blacklistAccount = (id) => {
    const acc = d.accounts.find(a => a.id === id);
    if (acc) {
      acc.status = 'blacklisted';
      log(d, `Account ${acc.credential} blacklisted`, u.username);
      save(d);
      render();
      sound('menu');
      toast('⛔ ' + (isEn ? 'Account blacklisted!' : 'Account geblacklistet!'));
    }
  };
  
  window.unblacklistAccount = (id) => {
    const acc = d.accounts.find(a => a.id === id);
    if (acc) {
      acc.status = 'available';
      log(d, `Account ${acc.credential} unblacklisted`, u.username);
      save(d);
      render();
      sound('menu');
      toast('✅ ' + (isEn ? 'Account unblacklisted!' : 'Account entblacklistet!'));
    }
  };

  window.blacklistUser = (id) => {
    const user = d.users.find(u => u.id === id);
    if (user) {
      user.blacklisted = true;
      log(d, `User ${user.username} blacklisted`, u.username);
      save(d);
      render();
      sound('menu');
      toast('⛔ ' + (isEn ? 'User blacklisted!' : 'User geblacklistet!'));
    }
  };
  
  window.unblacklistUser = (id) => {
    const user = d.users.find(u => u.id === id);
    if (user) {
      user.blacklisted = false;
      log(d, `User ${user.username} unblacklisted`, u.username);
      save(d);
      render();
      sound('menu');
      toast('✅ ' + (isEn ? 'User unblacklisted!' : 'User entblacklistet!'));
    }
  };

  window.showAddChangelogModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:#05050bbd;backdrop-filter:blur(5px);z-index:9;';
    modal.innerHTML = `
      <div class="modal card" style="width:min(100%,430px);padding:24px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
        <h2 style="margin:0 0 7px;color:var(--text);">${isEn ? 'Add Changelog Entry' : 'Changelog-Eintrag hinzufügen'}</h2>
        <p style="color:var(--muted);margin:0 0 12px;font-size:13px;">${isEn ? 'Use + for green, - for red, * for white' : 'Benutze + für grün, - für rot, * für weiß'}</p>
        <form id="add-changelog-form">
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Message' : 'Nachricht'}</span>
            <textarea name="message" required rows="4" placeholder="${isEn ? '+ Added new feature\n- Fixed bug\n* Important update' : '+ Neue Funktion hinzugefügt\n- Bug behoben\n* Wichtiges Update'}" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;min-height:120px;resize:vertical;"></textarea>
          </label>
          <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:9px;margin-top:12px;">
            <button type="button" class="btn ghost" onclick="this.closest('.modal-backdrop').remove()" style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Cancel' : 'Abbrechen'}</button>
            <button class="btn" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Add' : 'Hinzufügen'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#add-changelog-form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      d.changelog.push({
        id: id(d.changelog),
        message: f.get('message'),
        user: u.username,
        timestamp: new Date().toLocaleString('de-DE')
      });
      log(d, `Changelog entry added`, u.username);
      save(d);
      render();
      modal.remove();
      sound('ok');
      toast('✅ ' + (isEn ? 'Entry added!' : 'Eintrag hinzugefügt!'));
    };
  };

  window.showAddLicenseModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:#05050bbd;backdrop-filter:blur(5px);z-index:9;';
    modal.innerHTML = `
      <div class="modal card" style="width:min(100%,430px);padding:24px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
        <h2 style="margin:0 0 7px;color:var(--text);">${isEn ? 'Create License Key' : 'Lizenzschlüssel erstellen'}</h2>
        <form id="add-license-form">
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'License Key' : 'Lizenzschlüssel'}</span>
            <input name="key" value="${generateLicenseKey()}" readonly style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;font-family:monospace;">
          </label>
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Type' : 'Typ'}</span>
            <select name="type" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;">
              <option value="lifetime">Lifetime</option>
              <option value="month">Month</option>
              <option value="day">Day</option>
            </select>
          </label>
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Daily Account Limit' : 'Tägliches Account-Limit'}</span>
            <input name="daily_limit" type="number" value="50" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;">
          </label>
          <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:9px;margin-top:12px;">
            <button type="button" class="btn ghost" onclick="this.closest('.modal-backdrop').remove()" style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Cancel' : 'Abbrechen'}</button>
            <button class="btn" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Create' : 'Erstellen'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#add-license-form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const key = f.get('key');
      const type = f.get('type');
      const dailyLimit = parseInt(f.get('daily_limit')) || 50;
      
      if (d.licenses.find(l => l.key === key)) {
        toast(isEn ? '❌ License key already exists.' : '❌ Lizenzschlüssel existiert bereits.');
        return;
      }
      
      d.licenses.push({
        id: id(d.licenses),
        key: key,
        type: type,
        daily_limit: dailyLimit,
        used_by: null,
        created: new Date().toISOString().slice(0, 10),
        active: 1,
        max_uses: 1,
        current_uses: 0
      });
      save(d);
      log(d, `License ${key} created (${type})`, u.username);
      render();
      modal.remove();
      sound('ok');
      toast(`✅ ${isEn ? 'License created!' : 'Lizenz erstellt!'}`);
    };
  };

  window.deleteLicense = (id) => {
    const idx = d.licenses.findIndex(l => l.id === id);
    if (idx > -1) {
      const lic = d.licenses[idx];
      d.licenses.splice(idx, 1);
      log(d, `License ${lic.key} deleted`, u.username);
      save(d);
      render();
      sound('menu');
      toast('🗑️ ' + (isEn ? 'License deleted' : 'Lizenz gelöscht'));
    }
  };

  window.showAddUserModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:18px;background:#05050bbd;backdrop-filter:blur(5px);z-index:9;';
    modal.innerHTML = `
      <div class="modal card" style="width:min(100%,430px);padding:24px;border:1px solid #595975b8;background:linear-gradient(145deg,#2d2d44e6,#1e1e2ef2);border-radius:16px;box-shadow:var(--shadow);">
        <h2 style="margin:0 0 7px;color:var(--text);">${isEn ? 'Add User' : 'Benutzer hinzufügen'}</h2>
        <form id="add-user-form">
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Username' : 'Benutzername'}</span><input name="username" required style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;"></label>
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Email' : 'E-Mail'}</span><input name="email" type="email" required style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;"></label>
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Password' : 'Passwort'}</span><input name="password" type="password" required style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;"></label>
          <label class="field" style="display:block;margin:14px 0;"><span style="display:block;margin-bottom:7px;color:#dedff1;font-size:13px;font-weight:700;">${isEn ? 'Role' : 'Rolle'}</span>
            <select name="role" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px;color:var(--text);background:#151520;outline:0;">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:9px;margin-top:12px;">
            <button type="button" class="btn ghost" onclick="this.closest('.modal-backdrop').remove()" style="border:0;border-radius:10px;padding:10px 14px;background:transparent;border:1px solid var(--line);color:#e5e6f8;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Cancel' : 'Abbrechen'}</button>
            <button class="btn" style="border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;transition:.15s;cursor:pointer;">${isEn ? 'Add' : 'Hinzufügen'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#add-user-form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const username = f.get('username').trim();
      const email = f.get('email').trim();
      const password = f.get('password');
      const role = f.get('role');
      
      if (d.users.find(u => u.username === username)) {
        toast(isEn ? '❌ Username already exists.' : '❌ Benutzername existiert bereits.');
        return;
      }
      
      const hashedPassword = hash(password);
      const newUser = {
        id: id(d.users),
        username: username,
        email: email,
        password: hashedPassword,
        role: role,
        ip: '',
        cooldowns: {},
        created: new Date().toISOString().slice(0, 10),
        blacklisted: false,
        _plainPassword: password,
        license_key: null,
        license_type: null,
        daily_limit: 0,
        used_today: 0
      };
      d.users.push(newUser);
      save(d);
      log(d, `User ${username} added (${role})`, u.username);
      render();
      modal.remove();
      sound('ok');
      toast(`✅ ${isEn ? 'User added!' : 'Benutzer hinzugefügt!'}`);
    };
  };

  window.deleteUser = (id) => {
    const idx = d.users.findIndex(u => u.id === id);
    if (idx > -1) {
      const user = d.users[idx];
      if (user.username === 'nova' || user.username === 'gurke') return toast('❌ ' + (isEn ? 'Cannot delete admin.' : 'Admin kann nicht gelöscht werden.'));
      d.users.splice(idx, 1);
      log(d, `User ${user.username} deleted`, u.username);
      save(d);
      render();
      sound('menu');
      toast('🗑️ ' + (isEn ? 'User deleted' : 'Benutzer gelöscht'));
    }
  };
}

function bindUser(d, u) {
  const isEn = prefs().language === 'en';
  
  window.claimAccount = (serviceId) => {
    if (!u.license_key) {
      return toast(isEn ? '❌ No license found! Please contact an admin.' : '❌ Keine Lizenz gefunden! Bitte kontaktiere einen Admin.');
    }
    
    const cooldownKey = `service_${serviceId}`;
    const lastClaim = (u.cooldowns || {})[cooldownKey] || 0;
    const service = d.services.find(s => s.id === serviceId);
    const cooldownTime = (service?.cooldown || 0) * 1000;
    
    if (Date.now() - lastClaim < cooldownTime) {
      const remaining = Math.ceil((cooldownTime - (Date.now() - lastClaim)) / 1000);
      return toast(`⏳ ${isEn ? 'Cooldown' : 'Cooldown'}: ${remaining}s ${isEn ? 'wait.' : 'warten.'}`);
    }
    
    const user = d.users.find(usr => usr.id === u.id);
    if (user && user.used_today >= user.daily_limit) {
      return toast(`❌ ${isEn ? 'Daily limit reached!' : 'Tageslimit erreicht!'}`);
    }

    const account = d.accounts.find(a => a.service_id === serviceId && a.status === 'available');
    if (!account) return toast('❌ ' + (isEn ? 'No account available.' : 'Kein Account verfügbar.'));

    account.status = 'taken';
    account.claimed_by = u.id;
    account.claimed_at = Date.now();

    if (!u.cooldowns) u.cooldowns = {};
    u.cooldowns[cooldownKey] = Date.now();

    if (user) {
      user.used_today = (user.used_today || 0) + 1;
      save(d);
    }

    const expiresAt = Date.now() + 43200000;

    d.deliveries.push({
      id: id(d.deliveries),
      user_id: u.id,
      service_id: serviceId,
      service_name: service?.name || 'Service',
      credential: account.credential,
      expires: expiresAt
    });

    log(d, `${u.username} claimed ${service?.name || 'account'}`, u.username);
    save(d);
    render();
    sound('ok');
    showClaimModal(account.credential, service?.name || 'Service');
  };
}

function bindSettings() {
  const p = prefs();
  
  const langSelect = document.querySelector('#language-select');
  if (langSelect) {
    langSelect.onchange = () => {
      savePrefs({ ...p, language: langSelect.value });
      render();
    };
  }
  
  const primaryColor = document.querySelector('#primary-color');
  if (primaryColor) {
    primaryColor.onchange = () => {
      savePrefs({ ...p, primaryColor: primaryColor.value });
      applyTheme();
    };
  }
  
  const secondaryColor = document.querySelector('#secondary-color');
  if (secondaryColor) {
    secondaryColor.onchange = () => {
      savePrefs({ ...p, secondaryColor: secondaryColor.value });
      applyTheme();
    };
  }
  
  const countSlider = document.querySelector('#particle-count');
  if (countSlider) {
    countSlider.oninput = () => {
      const val = parseInt(countSlider.value);
      countSlider.parentElement.querySelector('.range-value').textContent = val;
      savePrefs({ ...p, particles: val });
    };
  }

  const typeSelect = document.querySelector('#particle-type');
  if (typeSelect) {
    typeSelect.onchange = () => {
      savePrefs({ ...p, type: typeSelect.value });
    };
  }

  const motionSelect = document.querySelector('#particle-motion');
  if (motionSelect) {
    motionSelect.onchange = () => {
      savePrefs({ ...p, motion: motionSelect.value });
    };
  }

  const volumeSlider = document.querySelector('#volume');
  if (volumeSlider) {
    volumeSlider.oninput = () => {
      const val = parseInt(volumeSlider.value);
      volumeSlider.parentElement.querySelector('.range-value').textContent = `${val}%`;
      savePrefs({ ...p, volume: val });
    };
  }

  const soundsCheck = document.querySelector('#menu-sounds');
  if (soundsCheck) {
    soundsCheck.onchange = () => {
      savePrefs({ ...p, menuSounds: soundsCheck.checked });
    };
  }

  const copyCheck = document.querySelector('#auto-copy');
  if (copyCheck) {
    copyCheck.onchange = () => {
      savePrefs({ ...p, autoCopy: copyCheck.checked });
    };
  }
}

// ============================================================
// RENDER
// ============================================================
async function render() {
  const u = await current();
  if (!u) { 
    login(); 
    return; 
  }
  const d = await load();
  const admin = u.role === 'admin';
  let content;
  if (tab === 'settings') content = settingsPage();
  else if (admin) {
    if (tab === 'accounts') content = accounts(d);
    else if (tab === 'users') content = users(d);
    else if (tab === 'licenses') content = licenses(d);
    else if (tab === 'changelog') content = changes(d, true);
    else if (tab === 'logs') content = logs(d);
    else content = stats(d);
  } else {
    content = home(d, u);
  }
  nav(u, content);
  if (admin) { bindAdmin(d, u); }
  else { bindUser(d, u); }
  bindSettings();
  particles();
  applyTheme();
}

// ============================================================
// START
// ============================================================
particles();
applyTheme();
render();