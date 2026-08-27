import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { collection, query, where, getDocs, orderBy, limit, startAfter } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { countDocs, loadBatches } from '../../utils/firestore';
import { formatDate, getAttendancePercentage } from '../../utils/helpers';
import { HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi';

const PAGE_SIZE = 25;

export default function AttendanceView() {
  const { currentUser } = useAuth();
  const [records, setRecords] = useState([]);
  const [batches, setBatches] = useState({});
  const [loading, setLoading] = useState(true);
  const [presentCount, setPresentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recordsQuery(...extra) {
    return query(
      collection(db, 'attendance'),
      where('studentId', '==', currentUser.uid),
      orderBy('date', 'desc'),
      ...extra
    );
  }

  async function loadData() {
    try {
      const mine = query(collection(db, 'attendance'), where('studentId', '==', currentUser.uid));
      const [batchList, total, present, snap] = await Promise.all([
        loadBatches(),
        // Totals are counted server-side so the percentage stays correct while
        // only the first page of records is downloaded. This used to pull the
        // student's entire attendance history on every visit.
        countDocs(mine),
        countDocs(query(mine, where('present', '==', true))),
        getDocs(recordsQuery(limit(PAGE_SIZE + 1))),
      ]);

      const batchMap = {};
      batchList.forEach((b) => { batchMap[b.id] = b.name; });
      setBatches(batchMap);

      setTotalCount(total);
      setPresentCount(present);
      const page = snap.docs.slice(0, PAGE_SIZE);
      setRecords(page.map((d) => ({ id: d.id, ...d.data() })));
      setLastDoc(page[page.length - 1] || null);
      // The extra row is a lookahead only; it is never rendered.
      setHasMore(snap.docs.length > PAGE_SIZE);
    } catch (err) {
      console.error('Error loading attendance:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!lastDoc) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(recordsQuery(startAfter(lastDoc), limit(PAGE_SIZE + 1)));
      const page = snap.docs.slice(0, PAGE_SIZE);
      setRecords((prev) => [...prev, ...page.map((d) => ({ id: d.id, ...d.data() }))]);
      setLastDoc(page[page.length - 1] || lastDoc);
      setHasMore(snap.docs.length > PAGE_SIZE);
    } catch (err) {
      console.error('Error loading more attendance:', err);
    } finally {
      setLoadingMore(false);
    }
  }

  const percentage = getAttendancePercentage(presentCount, totalCount);
  const pctColor = percentage >= 75 ? 'var(--green-700)' : percentage >= 50 ? '#b45309' : 'var(--danger)';

  if (loading) {
    return <div className="spinner-overlay"><div className="spinner"></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>📅 Attendance</h1>
        <p>Your attendance record</p>
      </div>

      {/* Percentage Card */}
      <div className="card" style={{ textAlign: 'center', marginBottom: 24, padding: 24 }}>
        <div style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          border: `4px solid ${pctColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
          background: percentage >= 75 ? 'var(--green-50)' : percentage >= 50 ? 'var(--warning-light)' : 'var(--danger-light)',
        }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: pctColor }}>
            {percentage}%
          </span>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>
          {presentCount} present out of {totalCount} classes
        </p>
        <div className="progress-bar" style={{ marginTop: 12 }}>
          <div
            className={`progress-fill ${percentage >= 75 ? '' : percentage >= 50 ? 'medium' : 'low'}`}
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      </div>

      {/* Records */}
      {records.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h3>No Attendance Records</h3>
          <p>Your attendance will appear here once marked by the teacher.</p>
        </div>
      ) : (
        <div className="stagger-list">
          {records.map((record) => (
            <div className="list-card" key={record.id}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: record.present ? 'var(--green-100)' : 'var(--danger-light)',
                color: record.present ? 'var(--green-700)' : 'var(--danger)',
                fontSize: '1.25rem', flexShrink: 0,
              }}>
                {record.present ? <HiOutlineCheckCircle /> : <HiOutlineXCircle />}
              </div>
              <div className="list-card-content">
                <h4>{formatDate(record.date)}</h4>
                <p>
                  {record.present ? 'Present' : 'Absent'}
                  {record.batchId && batches[record.batchId] && (
                    <span style={{ color: 'var(--gray-400)', marginLeft: 6 }}>
                      • {batches[record.batchId]}
                    </span>
                  )}
                </p>
              </div>
              <span className={`badge ${record.present ? 'badge-success' : 'badge-danger'}`}>
                {record.present ? 'P' : 'A'}
              </span>
            </div>
          ))}
          {hasMore && (
            <button
              className="btn btn-secondary btn-block"
              style={{ marginTop: 12 }}
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading...' : `Show older (${records.length} of ${totalCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
