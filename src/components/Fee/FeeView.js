import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { collection, query, where, getDocs, orderBy, limit, startAfter } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { countDocs } from '../../utils/firestore';
import { HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi';

const PAGE_SIZE = 25;

export default function FeeView() {
  const { currentUser } = useAuth();
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paidCount, setPaidCount] = useState(0);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadFees();
  }, []);

  function feesQuery(...extra) {
    return query(
      collection(db, 'fees'),
      where('studentId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      ...extra
    );
  }

  async function loadFees() {
    try {
      // The paid/pending tallies are counted server-side so they stay accurate
      // while only the first page of records is downloaded.
      const mine = query(collection(db, 'fees'), where('studentId', '==', currentUser.uid));
      const [total, paid, snap] = await Promise.all([
        countDocs(mine),
        countDocs(query(mine, where('paid', '==', true))),
        getDocs(feesQuery(limit(PAGE_SIZE))),
      ]);
      setPaidCount(paid);
      setUnpaidCount(total - paid);
      setFees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.size === PAGE_SIZE);
    } catch (err) {
      console.error('Error loading fees:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!lastDoc) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(feesQuery(startAfter(lastDoc), limit(PAGE_SIZE)));
      setFees((prev) => [...prev, ...snap.docs.map((d) => ({ id: d.id, ...d.data() }))]);
      setLastDoc(snap.docs[snap.docs.length - 1] || lastDoc);
      setHasMore(snap.size === PAGE_SIZE);
    } catch (err) {
      console.error('Error loading more fees:', err);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return <div className="spinner-overlay"><div className="spinner"></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>💰 Fee Details</h1>
        <p>Your fee payment status</p>
      </div>

      {/* Summary */}
      {(paidCount + unpaidCount) > 0 && (
        <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
              <HiOutlineCheckCircle />
            </div>
            <div className="stat-value">{paidCount}</div>
            <div className="stat-label">Paid</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
              <HiOutlineXCircle />
            </div>
            <div className="stat-value">{unpaidCount}</div>
            <div className="stat-label">Pending</div>
          </div>
        </div>
      )}

      {fees.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💳</div>
          <h3>No Fee Records</h3>
          <p>Your fee details will appear here once added by the teacher.</p>
        </div>
      ) : (
        <div className="stagger-list">
          {fees.map((fee) => {
            let dueLabel = null;
            if (!fee.paid && fee.dueDate) {
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const due = new Date(fee.dueDate); due.setHours(0, 0, 0, 0);
              const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
              if (diff < 0) dueLabel = { text: `Overdue by ${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''}`, color: 'var(--danger)' };
              else if (diff === 0) dueLabel = { text: 'Due today!', color: 'var(--danger)' };
              else if (diff <= 7) dueLabel = { text: `Due in ${diff} day${diff > 1 ? 's' : ''}`, color: '#b45309' };
            }
            return (
              <div className="list-card" key={fee.id} style={{
                borderLeft: `4px solid ${fee.paid ? 'var(--green-500)' : 'var(--danger)'}`,
              }}>
                <div className="list-card-content">
                  <h4 style={{ fontSize: '0.9375rem' }}>{fee.month}</h4>
                  <p>₹{fee.amount || '—'}</p>
                  {dueLabel && (
                    <p style={{ fontSize: '0.75rem', color: dueLabel.color, fontWeight: 600, marginTop: 2 }}>
                      ⏰ {dueLabel.text}
                    </p>
                  )}
                </div>
                <span className={`badge ${fee.paid ? 'badge-success' : 'badge-danger'}`}>
                  {fee.paid ? '✓ PAID' : '✗ NOT PAID'}
                </span>
              </div>
            );
          })}
          {hasMore && (
            <button
              className="btn btn-secondary btn-block"
              style={{ marginTop: 12 }}
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading...' : `Show older (${fees.length} of ${paidCount + unpaidCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
