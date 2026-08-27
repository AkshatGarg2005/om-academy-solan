import {
  collection,
  query,
  where,
  documentId,
  getDocs,
  getCountFromServer,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// Firestore accepts at most 30 values in an `in` filter, so larger id lists
// have to be split across several queries.
const IN_CHUNK_SIZE = 30;

// A write batch commits at most 500 operations.
const WRITE_CHUNK_SIZE = 500;

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function toRecords(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Reads ──────────────────────────────────────────────────

// Counts matching documents on the server. Firestore bills this as one read per
// 1000 index entries scanned instead of one read per document, so it is far
// cheaper than fetching a whole collection just to look at its size.
export async function countDocs(queryOrCollection) {
  const snap = await getCountFromServer(queryOrCollection);
  return snap.data().count;
}

// Counts documents whose `field` matches any of `values`, plus any extra query
// constraints. Chunked because of the 30-value `in` limit.
export async function countByIds(collectionName, field, values, ...extraConstraints) {
  if (!values || values.length === 0) return 0;
  const counts = await Promise.all(
    chunk(values, IN_CHUNK_SIZE).map((ids) =>
      countDocs(query(collection(db, collectionName), where(field, 'in', ids), ...extraConstraints))
    )
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

// Fetches documents whose `field` matches any of `values`. Same chunking as
// countByIds, but returns the records rather than a tally.
export async function queryByIds(collectionName, field, values, ...extraConstraints) {
  if (!values || values.length === 0) return [];
  const snaps = await Promise.all(
    chunk(values, IN_CHUNK_SIZE).map((ids) =>
      getDocs(query(collection(db, collectionName), where(field, 'in', ids), ...extraConstraints))
    )
  );
  return snaps.flatMap(toRecords);
}

// Fetches documents by id, one query per 30 ids, instead of a getDoc per id.
export async function getDocsByIds(collectionName, ids) {
  return queryByIds(collectionName, documentId(), ids);
}

// ─── Writes ─────────────────────────────────────────────────

// Commits `writes` as batches rather than as individual requests. Each entry is
// a function that applies one operation to the batch it is handed.
//
// Beyond saving round trips, this collapses security-rule evaluation: rules run
// per request, so N individual writes each pay for their own role lookup, while
// a batch resolves it once.
export async function commitInChunks(writes) {
  for (const group of chunk(writes, WRITE_CHUNK_SIZE)) {
    const batch = writeBatch(db);
    group.forEach((applyTo) => applyTo(batch));
    await batch.commit();
  }
}

// ─── Cache ──────────────────────────────────────────────────
//
// Reference data (the student roster, batches, courses) was previously refetched
// from scratch on every page that needed it, so moving between staff screens
// re-downloaded the same collections repeatedly. This is a process-lifetime
// cache: entries expire on a TTL, and mutations invalidate their key explicitly
// so a stale roster is never shown after an edit.

const DEFAULT_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

export const cacheKeys = {
  batches: 'batches',
  courses: 'courses',
  teachers: 'teachers',
  // The roster differs per viewer: admins see everyone, teachers only their own
  // students, so each scope needs its own entry.
  students: (isAdmin, uid) => (isAdmin ? 'students:all' : `students:${uid}`),
};

// Returns the cached value for `key` when it is still fresh, otherwise runs
// `loader` and caches the result. Concurrent callers share one in-flight load.
export async function cached(key, loader, ttlMs = DEFAULT_TTL_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAt < ttlMs) return hit.value;

  const pending = loader();
  cache.set(key, { storedAt: Date.now(), value: pending });
  try {
    const value = await pending;
    cache.set(key, { storedAt: Date.now(), value });
    return value;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

// Drops one key, or every key starting with `prefix` when it ends in ':'.
export function invalidate(prefix) {
  if (prefix.endsWith(':')) {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
    return;
  }
  cache.delete(prefix);
}

// Every roster scope at once, for changes that can affect more than the acting
// user's view (adding, deleting or reassigning a student).
export function invalidateStudents() {
  invalidate('students:');
}

// Called on sign-out so the next account to use this tab starts clean.
export function clearCache() {
  cache.clear();
}

// ─── Shared queries ─────────────────────────────────────────

export function studentsQuery(isAdmin, uid) {
  return isAdmin
    ? query(collection(db, 'users'), where('role', '==', 'student'))
    : query(
        collection(db, 'users'),
        where('role', '==', 'student'),
        where('teacherIds', 'array-contains', uid)
      );
}

export function loadStudents(isAdmin, uid) {
  return cached(cacheKeys.students(isAdmin, uid), async () =>
    toRecords(await getDocs(studentsQuery(isAdmin, uid)))
  );
}

export function loadBatches() {
  return cached(cacheKeys.batches, async () =>
    toRecords(await getDocs(collection(db, 'batches')))
  );
}

export function loadCourses() {
  return cached(cacheKeys.courses, async () =>
    toRecords(await getDocs(collection(db, 'courses')))
  );
}

// The plain teacher list, for filter dropdowns and assignment chips. Per-teacher
// student counts are deliberately not cached with it — they change whenever any
// student is reassigned, and they are cheap count aggregations.
export function loadTeachers() {
  return cached(cacheKeys.teachers, async () =>
    toRecords(await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher'))))
  );
}
