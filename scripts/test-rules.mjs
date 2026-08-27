/**
 * Exercises firestore.rules against the Firestore emulator.
 *
 *   npm install --no-save firebase-tools @firebase/rules-unit-testing
 *   npx firebase emulators:exec --only firestore --project demo-om-academy \
 *     "node scripts/test-rules.mjs"
 *
 * Requires Java (the Firestore emulator runs on the JVM). The test deps are
 * installed with --no-save so they stay out of the app's package.json.
 *
 * Covers both role paths: contexts without a custom claim fall back to the
 * user-document lookup (what production does today), and *WithClaim contexts
 * exercise the token path that scripts/set-role-claims.js enables.
 */
import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, deleteDoc, getDoc, collection, query, where,
  getDocs, getCountFromServer, documentId, addDoc,
} from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-om-academy',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/admin1'), { role: 'admin', name: 'Admin', email: 'a@x.com' });
  await setDoc(doc(db, 'users/teacher1'), { role: 'teacher', name: 'T1', email: 't1@x.com', phone: '1', subject: 'Math' });
  await setDoc(doc(db, 'users/teacher2'), { role: 'teacher', name: 'T2', email: 't2@x.com', phone: '2', subject: 'Sci' });
  await setDoc(doc(db, 'users/student1'), { role: 'student', name: 'S1', email: 's1@x.com', teacherIds: ['teacher1'], batchIds: [], courseIds: [] });
  await setDoc(doc(db, 'users/student2'), { role: 'student', name: 'S2', email: 's2@x.com', teacherIds: ['teacher2'], batchIds: [], courseIds: [] });
  await setDoc(doc(db, 'batches/b1'), { name: 'Morning', timing: '8-10' });
  await setDoc(doc(db, 'courses/c1'), { name: 'JEE', description: '' });
  await setDoc(doc(db, 'attendance/a1'), { studentId: 'student1', present: true, date: '2026-01-01', batchId: 'b1' });
  await setDoc(doc(db, 'attendance/a2'), { studentId: 'student1', present: false, date: '2026-01-02', batchId: 'b1' });
  await setDoc(doc(db, 'attendance/a3'), { studentId: 'student2', present: true, date: '2026-01-01', batchId: 'b1' });
  await setDoc(doc(db, 'fees/f1'), { studentId: 'student1', paid: false, amount: 100, month: 'Jan', createdAt: new Date() });
  await setDoc(doc(db, 'testReports/r1'), { studentId: 'student1', createdBy: 'teacher1', testDate: '2026-01-01', obtainedMarks: 8, totalMarks: 10 });
});

const admin = testEnv.authenticatedContext('admin1').firestore();
const teacher = testEnv.authenticatedContext('teacher1').firestore();
const teacher2 = testEnv.authenticatedContext('teacher2').firestore();
const student = testEnv.authenticatedContext('student1').firestore();
const anon = testEnv.unauthenticatedContext().firestore();
// Same people, but with the role carried on the token instead of the document.
const adminClaim = testEnv.authenticatedContext('admin1', { role: 'admin' }).firestore();
const teacherClaim = testEnv.authenticatedContext('teacher1', { role: 'teacher' }).firestore();
const studentClaim = testEnv.authenticatedContext('student1', { role: 'student' }).firestore();

const results = [];
async function check(group, name, expect, fn) {
  try {
    await (expect === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    results.push({ ok: true, group, name, expect });
  } catch (err) {
    results.push({ ok: false, group, name, expect, err: String(err.message || err).split('\n')[0] });
  }
}

// ── Security fixes this change set introduced ──────────────────
await check('escalation', 'teacher creates user with role:admin', 'deny', () =>
  setDoc(doc(teacher, 'users/evil'), { role: 'admin', name: 'Evil' }));
await check('escalation', 'teacher creates user with role:teacher', 'deny', () =>
  setDoc(doc(teacher, 'users/evil2'), { role: 'teacher', name: 'Evil' }));
await check('escalation', 'teacher creates user with role:student', 'allow', () =>
  setDoc(doc(teacher, 'users/newstudent'), { role: 'student', name: 'New', teacherIds: ['teacher1'], batchIds: [], courseIds: [] }));
await check('escalation', 'admin creates user with role:teacher', 'allow', () =>
  setDoc(doc(admin, 'users/newteacher'), { role: 'teacher', name: 'NewT' }));
await check('escalation', 'student self-registers as student', 'allow', () =>
  setDoc(doc(testEnv.authenticatedContext('fresh').firestore(), 'users/fresh'), { role: 'student', name: 'F', teacherIds: [] }));
await check('escalation', 'student self-registers as admin', 'deny', () =>
  setDoc(doc(testEnv.authenticatedContext('fresh2').firestore(), 'users/fresh2'), { role: 'admin', name: 'F2' }));

await check('teacher scope', 'teacher sets batchIds on assigned student', 'allow', () =>
  updateDoc(doc(teacher, 'users/student1'), { batchIds: ['b1'] }));
await check('teacher scope', 'teacher sets courseIds on assigned student', 'allow', () =>
  updateDoc(doc(teacher, 'users/student1'), { courseIds: ['c1'] }));
await check('teacher scope', 'teacher sets batchIds on UNASSIGNED student', 'deny', () =>
  updateDoc(doc(teacher, 'users/student2'), { batchIds: ['b1'] }));
await check('teacher scope', 'teacher renames an assigned student', 'deny', () =>
  updateDoc(doc(teacher, 'users/student1'), { name: 'Hacked' }));
await check('teacher scope', 'teacher grants a student a role', 'deny', () =>
  updateDoc(doc(teacher, 'users/student1'), { role: 'admin' }));
await check('teacher scope', 'teacher reassigns a student to themselves', 'deny', () =>
  updateDoc(doc(teacher2, 'users/student1'), { teacherIds: ['teacher2'] }));

await check('self-update', 'teacher edits own profile (was broken before)', 'allow', () =>
  updateDoc(doc(teacher, 'users/teacher1'), { name: 'T1 new', phone: '99', subject: 'Physics', updatedAt: new Date() }));
await check('self-update', 'admin edits own profile', 'allow', () =>
  updateDoc(doc(admin, 'users/admin1'), { name: 'Admin new', updatedAt: new Date() }));
await check('self-update', 'student edits own name', 'allow', () =>
  updateDoc(doc(student, 'users/student1'), { name: 'S1 new', updatedAt: new Date() }));
// Values must genuinely differ from what is stored: writing an identical value
// produces an empty diff, which hasOnly() passes trivially. That is harmless (a
// no-op write changes nothing) but it does not exercise the rule.
await check('self-update', 'student self-enrols into a course', 'deny', () =>
  updateDoc(doc(student, 'users/student1'), { courseIds: ['c1', 'c-sneaky'] }));
await check('self-update', 'student adds self to a batch', 'deny', () =>
  updateDoc(doc(student, 'users/student1'), { batchIds: ['b1', 'b-sneaky'] }));
await check('self-update', 'student clears own courseIds', 'deny', () =>
  updateDoc(doc(student, 'users/student1'), { courseIds: [] }));
await check('self-update', 'student no-op write of unchanged courseIds', 'allow', () =>
  updateDoc(doc(student, 'users/student1'), { courseIds: ['c1'] }));
await check('self-update', 'student promotes self to admin', 'deny', () =>
  updateDoc(doc(student, 'users/student1'), { role: 'admin' }));
await check('self-update', 'student assigns self a teacher', 'deny', () =>
  updateDoc(doc(student, 'users/student1'), { teacherIds: ['teacher2'] }));

await check('delete', 'teacher deletes a student', 'deny', () =>
  deleteDoc(doc(teacher, 'users/student1')));
await check('delete', 'teacher deletes a batch', 'deny', () =>
  deleteDoc(doc(teacher, 'batches/b1')));
await check('delete', 'teacher deletes a course', 'deny', () =>
  deleteDoc(doc(teacher, 'courses/c1')));
await check('delete', 'teacher still creates a batch', 'allow', () =>
  setDoc(doc(teacher, 'batches/b2'), { name: 'Evening', timing: '5-7' }));
await check('delete', 'teacher still updates a batch', 'allow', () =>
  updateDoc(doc(teacher, 'batches/b1'), { timing: '9-11' }));
await check('delete', 'admin deletes a batch', 'allow', () =>
  deleteDoc(doc(admin, 'batches/b2')));
await check('delete', 'admin deletes a course', 'allow', () =>
  setDoc(doc(admin, 'courses/c2'), { name: 'tmp' }).then(() =>
    deleteDoc(doc(admin, 'courses/c2'))));
await check('delete', 'admin deletes a student', 'allow', () =>
  deleteDoc(doc(admin, 'users/newstudent')));

// ── Reads the app performs ─────────────────────────────────────
await check('reads', 'student reads own profile', 'allow', () =>
  getDoc(doc(student, 'users/student1')));
await check('reads', 'student reads another student profile', 'deny', () =>
  getDoc(doc(student, 'users/student2')));
await check('reads', 'student lists users', 'deny', () =>
  getDocs(query(collection(student, 'users'), where('role', '==', 'student'))));
await check('reads', 'admin lists students', 'allow', () =>
  getDocs(query(collection(admin, 'users'), where('role', '==', 'student'))));
await check('reads', 'teacher lists own students (array-contains)', 'allow', () =>
  getDocs(query(collection(teacher, 'users'), where('role', '==', 'student'), where('teacherIds', 'array-contains', 'teacher1'))));
await check('reads', 'unauthenticated reads a batch', 'deny', () =>
  getDoc(doc(anon, 'batches/b1')));
await check('reads', 'student reads batches by documentId in', 'allow', () =>
  getDocs(query(collection(student, 'batches'), where(documentId(), 'in', ['b1']))));
await check('reads', 'student reads courses by documentId in', 'allow', () =>
  getDocs(query(collection(student, 'courses'), where(documentId(), 'in', ['c1']))));

// ── Count aggregations introduced on the dashboards ────────────
await check('aggregation', 'student counts own attendance', 'allow', () =>
  getCountFromServer(query(collection(student, 'attendance'), where('studentId', '==', 'student1'))));
await check('aggregation', 'student counts own attendance where present', 'allow', () =>
  getCountFromServer(query(collection(student, 'attendance'), where('studentId', '==', 'student1'), where('present', '==', true))));
await check('aggregation', 'student counts ALL attendance (unfiltered)', 'deny', () =>
  getCountFromServer(collection(student, 'attendance')));
await check('aggregation', "student counts another student's attendance", 'deny', () =>
  getCountFromServer(query(collection(student, 'attendance'), where('studentId', '==', 'student2'))));
await check('aggregation', 'admin counts ALL attendance', 'allow', () =>
  getCountFromServer(collection(admin, 'attendance')));
await check('aggregation', 'admin counts ALL testReports', 'allow', () =>
  getCountFromServer(collection(admin, 'testReports')));
await check('aggregation', 'admin counts unpaid fees', 'allow', () =>
  getCountFromServer(query(collection(admin, 'fees'), where('paid', '==', false))));
await check('aggregation', 'admin counts students per teacher', 'allow', () =>
  getCountFromServer(query(collection(admin, 'users'), where('role', '==', 'student'), where('teacherIds', 'array-contains', 'teacher1'))));
await check('aggregation', 'teacher counts fees by studentId in + paid', 'allow', () =>
  getCountFromServer(query(collection(teacher, 'fees'), where('studentId', 'in', ['student1']), where('paid', '==', false))));
await check('aggregation', 'teacher counts attendance by studentId in', 'allow', () =>
  getCountFromServer(query(collection(teacher, 'attendance'), where('studentId', 'in', ['student1']))));
await check('aggregation', 'student counts own testReports', 'allow', () =>
  getCountFromServer(query(collection(student, 'testReports'), where('studentId', '==', 'student1'))));
await check('aggregation', 'student counts own fees where paid', 'allow', () =>
  getCountFromServer(query(collection(student, 'fees'), where('studentId', '==', 'student1'), where('paid', '==', true))));

// ── Writes the app performs ────────────────────────────────────
await check('writes', 'teacher creates an attendance record', 'allow', () =>
  addDoc(collection(teacher, 'attendance'), { studentId: 'student1', batchId: 'b1', date: '2026-02-01', present: true, markedBy: 'teacher1' }));
await check('writes', 'teacher updates an attendance record', 'allow', () =>
  updateDoc(doc(teacher, 'attendance/a1'), { present: false, markedBy: 'teacher1' }));
await check('writes', 'student marks own attendance', 'deny', () =>
  addDoc(collection(student, 'attendance'), { studentId: 'student1', present: true, date: '2026-02-02' }));
await check('writes', 'student marks own fee as paid', 'deny', () =>
  updateDoc(doc(student, 'fees/f1'), { paid: true }));
await check('writes', 'teacher marks a fee paid', 'allow', () =>
  updateDoc(doc(teacher, 'fees/f1'), { paid: true }));
await check('writes', 'teacher deletes own test report', 'allow', () =>
  deleteDoc(doc(teacher, 'testReports/r1')));

// ── Custom-claim path (what set-role-claims.js enables) ────────
await check('claims', 'admin via claim lists students', 'allow', () =>
  getDocs(query(collection(adminClaim, 'users'), where('role', '==', 'student'))));
await check('claims', 'admin via claim counts all attendance', 'allow', () =>
  getCountFromServer(collection(adminClaim, 'attendance')));
await check('claims', 'teacher via claim creates a student', 'allow', () =>
  setDoc(doc(teacherClaim, 'users/claimstudent'), { role: 'student', name: 'C', teacherIds: ['teacher1'], batchIds: [], courseIds: [] }));
await check('claims', 'teacher via claim creates an admin', 'deny', () =>
  setDoc(doc(teacherClaim, 'users/claimevil'), { role: 'admin', name: 'E' }));
await check('claims', 'student via claim reads own profile', 'allow', () =>
  getDoc(doc(studentClaim, 'users/student1')));
await check('claims', 'student via claim lists users', 'deny', () =>
  getDocs(query(collection(studentClaim, 'users'), where('role', '==', 'student'))));

// ── Limits that utils/firestore.js chunks around ───────────────
// IN_CHUNK_SIZE = 30 and WRITE_CHUNK_SIZE = 500 are asserted here rather than
// trusted, because exceeding either fails only at runtime and only once the
// school is large enough to reach it.
async function limit(name, expect, fn) {
  try {
    await fn();
    results.push({ ok: expect === 'ok', group: 'limits', name, expect, err: 'succeeded' });
  } catch (err) {
    results.push({ ok: expect === 'error', group: 'limits', name, expect, err: String(err.message || err).split('\n')[0] });
  }
}
const ids = (n) => Array.from({ length: n }, (_, i) => `id${i}`);
await limit('`in` filter with 30 values', 'ok', () =>
  getCountFromServer(query(collection(admin, 'attendance'), where('studentId', 'in', ids(30)))));
await limit('`in` filter with 31 values', 'error', () =>
  getCountFromServer(query(collection(admin, 'attendance'), where('studentId', 'in', ids(31)))));
await limit('documentId() `in` with 30 values', 'ok', () =>
  getDocs(query(collection(student, 'batches'), where(documentId(), 'in', ids(30)))));

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const raw = ctx.firestore();
  const mkBatch = async (n) => {
    const { writeBatch } = await import('firebase/firestore');
    const b = writeBatch(raw);
    for (let i = 0; i < n; i++) b.set(doc(raw, `scratch/d${i}`), { i });
    await b.commit();
  };
  // Neither the emulator nor the current quota docs enforce a per-commit write
  // cap (the documented 500 is field transformations per document). Chunking at
  // 500 is conservative and correct whether or not a cap exists, so this just
  // confirms a full-size batch commits cleanly.
  await limit('writeBatch with 500 operations', 'ok', () => mkBatch(500));
});

await testEnv.cleanup();

let lastGroup = '';
let failed = 0;
for (const r of results) {
  if (r.group !== lastGroup) { console.log(`\n── ${r.group} ──`); lastGroup = r.group; }
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  [expect ${r.expect}] ${r.name}${r.ok ? '' : '\n          ' + r.err}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
