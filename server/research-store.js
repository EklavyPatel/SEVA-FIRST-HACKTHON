import { normalizeFieldContext } from './research-context.js';
import { researchFields } from '../shared/research-fields.js';
import { createCommunityStore } from './community.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './errors.js';

const deriveKey = promisify(scrypt);
export const CONSENT_VERSION = 'cotton-research-v1';
export const PARTS = ['leaf', 'boll', 'flower', 'stem', 'whole_plant', 'other', 'unknown'];
const hash = value => createHash('sha256').update(value).digest('hex');
export function boundedText(value, maximum, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new ApiError(400, 'RESEARCH_INPUT', 'Please check the research form fields.');
  const text = value.trim();
  if (required && !text) throw new ApiError(400, 'RESEARCH_INPUT', 'Please complete the required fields.');
  return text;
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\t\r\n]|^\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function openResearchStore({ path = resolve('data/research.sqlite'), maxPhotos = 500, maxBytes = 250 * 1024 * 1024 } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS contributors (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS researchers (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      institution TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS researcher_sessions (token_hash TEXT PRIMARY KEY, researcher_id TEXT NOT NULL REFERENCES researchers(id), expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS research_photos (id TEXT PRIMARY KEY, contributor_id TEXT NOT NULL REFERENCES contributors(id), request_key TEXT NOT NULL,
      payload_hash TEXT NOT NULL, image BLOB NOT NULL, byte_size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
      district TEXT NOT NULL, plant_part TEXT NOT NULL, symptoms TEXT NOT NULL, consent_version TEXT NOT NULL, consent_at TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(contributor_id,request_key));
    CREATE TABLE IF NOT EXISTS research_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, photo_id TEXT NOT NULL REFERENCES research_photos(id) ON DELETE CASCADE,
      researcher_id TEXT NOT NULL REFERENCES researchers(id), reviewer_name TEXT NOT NULL, institution TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('labeled','inconclusive','unsuitable')), label TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS photos_contributor ON research_photos(contributor_id,created_at);
    CREATE INDEX IF NOT EXISTS reviews_photo ON research_reviews(photo_id,id);
    CREATE INDEX IF NOT EXISTS session_expiry ON researcher_sessions(expires_at);`);
  // Additive migration preserves existing photos, consent and reviewer history.
  if (!db.prepare('PRAGMA table_info(research_photos)').all().some(column=>column.name==='field_context')) {
    db.exec("ALTER TABLE research_photos ADD COLUMN field_context TEXT NOT NULL DEFAULT '{}'");
  }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function contributor(token) {
    return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? db.prepare('SELECT id FROM contributors WHERE token_hash=?').get(hash(token))?.id : null;
  }
  function ensureContributor(token) {
    const id = contributor(token); if (id) return { id };
    const nextToken = randomBytes(32).toString('base64url'); const nextId = randomUUID();
    db.prepare('INSERT INTO contributors VALUES(?,?,?)').run(nextId, hash(nextToken), new Date().toISOString());
    return { id: nextId, token: nextToken };
  }
  function researcher(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return db.prepare(`SELECT r.id,r.username,r.name,r.institution FROM researcher_sessions s JOIN researchers r ON r.id=s.researcher_id
      WHERE s.token_hash=? AND s.expires_at>? AND r.active=1`).get(hash(token), Date.now()) || null;
  }
  const selection = `SELECT p.id,p.created_at AS createdAt,p.district,p.plant_part AS plantPart,p.symptoms,p.width,p.height,p.byte_size AS byteSize,
    p.consent_version AS consentVersion,p.field_context AS fieldContextJson, r.id AS reviewId,r.outcome,r.label,r.notes,r.reviewer_name AS reviewer,r.institution,r.created_at AS reviewedAt
    FROM research_photos p LEFT JOIN research_reviews r ON r.id=(SELECT MAX(id) FROM research_reviews WHERE photo_id=p.id)`;
  function publicPhoto(row) {
    const {fieldContextJson,...rest}=row;
    return { ...rest, fieldContext:JSON.parse(fieldContextJson||'{}'), status: row.reviewId ? 'reviewed' : 'unreviewed', imageUrl: `/api/research/photos/${row.id}/image` };
  }
  function list({ owner, q = '', status = 'all', part = 'all', offset = 0, limit = 12 } = {}) {
    const predicates = ['1=1']; const parameters = [];
    if (owner !== undefined) { predicates.push('p.contributor_id=?'); parameters.push(owner || ''); }
    if (q) { predicates.push("instr(lower(p.district || ' ' || p.field_context || ' ' || p.symptoms || ' ' || coalesce(r.label,'')),lower(?))>0"); parameters.push(q); }
    if (status === 'unreviewed') predicates.push('r.id IS NULL');
    else if (status === 'reviewed') predicates.push('r.id IS NOT NULL');
    if (part !== 'all') { predicates.push('p.plant_part=?'); parameters.push(part); }
    const where = ' WHERE ' + predicates.join(' AND ');
    const count = db.prepare('SELECT COUNT(*) AS count FROM (' + selection + where + ')').get(...parameters).count;
    const rows = db.prepare(selection + where + ' ORDER BY p.created_at DESC,p.id LIMIT ? OFFSET ?').all(...parameters, limit, offset);
    return { items: rows.map(publicPhoto), total: count, offset, limit };
  }
  function photo(id, { owner, staff } = {}) {
    const row = db.prepare(selection + ' WHERE p.id=?' + (staff ? '' : ' AND p.contributor_id=?')).get(...(staff ? [id] : [id, owner || '']));
    if (!row) throw new ApiError(404, 'RESEARCH_NOT_FOUND', 'This research photo is unavailable.');
    const reviews = db.prepare(`SELECT id,outcome,label,notes,reviewer_name AS reviewer,institution,created_at AS createdAt
      FROM research_reviews WHERE photo_id=? ORDER BY id DESC`).all(id);
    return { ...publicPhoto(row), reviews };
  }
  return {
    community: createCommunityStore(db),
    externalResearcher(user) {
      // This is called only after Supabase token verification and protected role
      // lookup. No password login exists for this generated local username.
      const username = 'supabase:' + user.id;
      let row = db.prepare('SELECT id,name,institution FROM researchers WHERE username=?').get(username);
      if (!row) {
        const id = randomUUID();
        db.prepare('INSERT INTO researchers VALUES(?,?,?,?,?,?,1)').run(id, username, 'Approved researcher ' + user.id.slice(0,8), 'Account approved by project administrator', randomBytes(16).toString('hex'), randomBytes(64).toString('hex'));
        row = { id, name: 'Approved researcher ' + user.id.slice(0,8), institution: 'Account approved by project administrator' };
      }
      return { ...row, username, external: true };
    },
    close: () => db.close(), contributor, ensureContributor, researcher, list, photo,
    stats(owner) {
      const totals = db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(byte_size),0) AS bytes FROM research_photos WHERE contributor_id=?').get(owner || '');
      return { ...totals, maximumContributions: 30 };
    },
    save({ owner, requestKey, image, details }) {
      const district = boundedText(details?.district, 80); const symptoms = boundedText(details?.symptoms, 1000);
      const part = details?.plantPart || 'unknown';
      const context=normalizeFieldContext(details?.fieldContext);
      const contextJson=JSON.stringify(context);
      if (!PARTS.includes(part) || typeof requestKey !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestKey)) throw new ApiError(400, 'RESEARCH_INPUT', 'Please check the research form fields.');
      const digest = hash(Buffer.concat([image.data, Buffer.from(JSON.stringify([district, symptoms, part, CONSENT_VERSION,...(contextJson==='{}'?[]:[contextJson])]))]));
      return transaction(() => {
        const existing = db.prepare('SELECT id,payload_hash FROM research_photos WHERE contributor_id=? AND request_key=?').get(owner, requestKey);
        if (existing) {
          if (existing.payload_hash !== digest) throw new ApiError(409, 'RESEARCH_DUPLICATE', 'This submission changed. Start a new contribution.');
          return { photo: photo(existing.id, { owner }), duplicate: true };
        }
        const total = db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(byte_size),0) AS bytes FROM research_photos').get();
        if (total.count >= maxPhotos || total.bytes + image.data.length > maxBytes) throw new ApiError(507, 'RESEARCH_FULL', 'Research storage is full. Please contact the project team.');
        if (this.stats(owner).count >= 30) throw new ApiError(429, 'RESEARCH_LIMIT', 'Your contribution limit has been reached. Withdraw an old contribution to add another.');
        const id = randomUUID(); const now = new Date().toISOString();
        db.prepare('INSERT INTO research_photos(id,contributor_id,request_key,payload_hash,image,byte_size,width,height,district,plant_part,symptoms,consent_version,consent_at,created_at,field_context) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, owner, requestKey, digest, image.data, image.data.length,
          image.width, image.height, district, part, symptoms, CONSENT_VERSION, now, now,contextJson);
        return { photo: photo(id, { owner }), duplicate: false };
      });
    },
    image(id, access) { photo(id, access); return db.prepare('SELECT image FROM research_photos WHERE id=?').get(id).image; },
    withdraw(id, owner) {
      return transaction(() => {
        photo(id, { owner });
        db.prepare('DELETE FROM research_photos WHERE id=? AND contributor_id=?').run(id, owner);
        return { withdrawn: true };
      });
    },
    review(id, staff, input) {
      const outcome = input?.outcome;
      if (!['labeled','inconclusive','unsuitable'].includes(outcome)) throw new ApiError(400, 'RESEARCH_INPUT', 'Choose a review outcome.');
      const label = boundedText(input.label, 150, outcome === 'labeled'); const notes = boundedText(input.notes, 2000, true);
      if (input.expectedReviewId !== null && !Number.isSafeInteger(input.expectedReviewId)) throw new ApiError(400, 'RESEARCH_INPUT', 'Refresh the photo before reviewing.');
      return transaction(() => {
        const current = photo(id, { staff });
        if (current.reviewId !== input.expectedReviewId) throw new ApiError(409, 'RESEARCH_CONFLICT', 'Another review was saved. Reopen this photo before submitting.');
        db.prepare('INSERT INTO research_reviews(photo_id,researcher_id,reviewer_name,institution,outcome,label,notes,created_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(id, staff.id, staff.name, staff.institution, outcome, label, notes, new Date().toISOString());
        return photo(id, { staff });
      });
    },
    async addResearcher({ username, name, institution, password }) {
      username = boundedText(username, 40, true).toLowerCase(); name = boundedText(name, 80, true); institution = boundedText(institution, 150, true);
      if (!/^[a-z0-9._-]{3,40}$/.test(username) || typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Use a 3–40 character username and a 12–128 character password.');
      const salt = randomBytes(16).toString('hex'); const key = await deriveKey(password, salt, 64);
      db.prepare('INSERT INTO researchers VALUES(?,?,?,?,?,?,1)').run(randomUUID(), username, name, institution, salt, key.toString('hex'));
    },
    disableResearcher(username) { db.prepare('UPDATE researchers SET active=0 WHERE username=?').run(username.toLowerCase()); },
    listResearchers() { return db.prepare('SELECT username,name,institution,active FROM researchers ORDER BY username').all(); },
    async login(username, password) {
      username = boundedText(username, 40).toLowerCase();
      if (typeof password !== 'string' || password.length > 128) throw new ApiError(401, 'RESEARCH_LOGIN', 'Incorrect username or password.');
      const account = db.prepare('SELECT * FROM researchers WHERE username=? AND active=1').get(username);
      // Run the same KDF for unknown accounts to reduce account-enumeration signals.
      const key = await deriveKey(password, account?.salt || '00000000000000000000000000000000', 64);
      if (!account || !timingSafeEqual(key, Buffer.from(account.password_hash, 'hex'))) throw new ApiError(401, 'RESEARCH_LOGIN', 'Incorrect username or password.');
      db.prepare('DELETE FROM researcher_sessions WHERE expires_at<?').run(Date.now());
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO researcher_sessions VALUES(?,?,?)').run(hash(token), account.id, Date.now() + 8 * 60 * 60 * 1000);
      return { token, researcher: researcher(token) };
    },
    logout(token) { if (typeof token === 'string') db.prepare('DELETE FROM researcher_sessions WHERE token_hash=?').run(hash(token)); },
    exportCsv() {
      const fields = ['id','createdAt','district','plantPart','symptoms','status','outcome','label','notes','reviewer','institution','reviewedAt','consentVersion'];
      fields.push(...researchFields.map(f=>f.key),'approxLatitude','approxLongitude');
      const rows = db.prepare(selection + ' ORDER BY p.created_at,p.id').all().map(publicPhoto).map(row=>({...row,...row.fieldContext,approxLatitude:row.fieldContext.coordinates?.latitude,approxLongitude:row.fieldContext.coordinates?.longitude}));
      return '\ufeff' + [fields.map(csvCell).join(','), ...rows.map(row => fields.map(key => csvCell(row[key])).join(','))].join('\r\n');
    },
  };
}
