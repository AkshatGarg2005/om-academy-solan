import {
  collection,
  query,
  where,
  documentId,
  getDocs,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// Firestore accepts at most 30 values in an `in` filter, so larger id lists
// have to be split across several queries.
const IN_CHUNK_SIZE = 30;

function chunk(arr, size = IN_CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

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
    chunk(values).map((ids) =>
      countDocs(query(collection(db, collectionName), where(field, 'in', ids), ...extraConstraints))
    )
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

// Fetches documents by id, one query per 30 ids, instead of a getDoc per id.
export async function getDocsByIds(collectionName, ids) {
  if (!ids || ids.length === 0) return [];
  const snaps = await Promise.all(
    chunk(ids).map((batch) =>
      getDocs(query(collection(db, collectionName), where(documentId(), 'in', batch)))
    )
  );
  return snaps.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}
