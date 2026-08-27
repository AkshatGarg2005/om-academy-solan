#!/usr/bin/env node
/**
 * Copies each user's `role` field from their Firestore document into a custom
 * claim on their Firebase Auth token.
 *
 * Why: every security rule that calls isStaff()/isAdmin()/isTeacher() otherwise
 * performs a get() on the caller's user document, and rule get() calls are
 * billed as document reads. With the claim present, firestore.rules reads the
 * role straight off the token and skips that lookup entirely.
 *
 * This is safe to run at any time, and safe *not* to run: the rules fall back to
 * reading the user document whenever a claim is absent, so behaviour is
 * identical either way — only the cost differs.
 *
 * Re-run it after changing anyone's role. The claim takes precedence over the
 * document, so a stale claim would otherwise win.
 *
 * Users pick up a changed claim on their next sign-in, or within the hour when
 * their ID token is next refreshed.
 *
 *   npm install --no-save firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/set-role-claims.js --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/set-role-claims.js
 *
 * The service account key comes from the Firebase console:
 *   Project settings → Service accounts → Generate new private key
 * Keep it out of version control.
 */

const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const VALID_ROLES = ['admin', 'teacher', 'student'];

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account key path.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });

async function main() {
  const snap = await admin.firestore().collection('users').get();
  console.log(`${snap.size} user document(s) found.${DRY_RUN ? ' (dry run)' : ''}\n`);

  let updated = 0;
  let skipped = 0;
  const problems = [];

  for (const docSnap of snap.docs) {
    const uid = docSnap.id;
    const role = docSnap.get('role');
    const label = `${docSnap.get('email') || '(no email)'} [${uid}]`;

    if (!VALID_ROLES.includes(role)) {
      problems.push(`${label}: unexpected role ${JSON.stringify(role)} — skipped`);
      continue;
    }

    let user;
    try {
      user = await admin.auth().getUser(uid);
    } catch (err) {
      // A Firestore user document with no matching auth account. This is normal
      // for accounts deleted from the console but left in Firestore.
      problems.push(`${label}: no auth account — skipped`);
      continue;
    }

    if (user.customClaims && user.customClaims.role === role) {
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      // Merge rather than replace, so any other claims survive.
      await admin.auth().setCustomUserClaims(uid, { ...(user.customClaims || {}), role });
    }
    console.log(`${DRY_RUN ? 'would set' : 'set'} role=${role} for ${label}`);
    updated++;
  }

  console.log(`\n${updated} updated, ${skipped} already correct, ${problems.length} skipped.`);
  problems.forEach((p) => console.log(`  ! ${p}`));

  if (DRY_RUN && updated > 0) console.log('\nRe-run without --dry-run to apply.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
