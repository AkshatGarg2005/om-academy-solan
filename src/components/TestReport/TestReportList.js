import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { collection, query, where, getDocs, orderBy, limit, startAfter } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { countDocs } from '../../utils/firestore';
import { formatDate } from '../../utils/helpers';

const PAGE_SIZE = 25;

export default function TestReportList() {
  const { currentUser } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedReport, setExpandedReport] = useState(null);
  const [total, setTotal] = useState(0);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reportsQuery(...extra) {
    return query(
      collection(db, 'testReports'),
      where('studentId', '==', currentUser.uid),
      orderBy('testDate', 'desc'),
      ...extra
    );
  }

  async function loadReports() {
    try {
      // A page at a time rather than the student's entire history on every
      // visit; the total comes from a count aggregation.
      const [count, snap] = await Promise.all([
        countDocs(query(collection(db, 'testReports'), where('studentId', '==', currentUser.uid))),
        getDocs(reportsQuery(limit(PAGE_SIZE + 1))),
      ]);
      setTotal(count);
      const page = snap.docs.slice(0, PAGE_SIZE);
      setReports(page.map((d) => ({ id: d.id, ...d.data() })));
      setLastDoc(page[page.length - 1] || null);
      // The extra row is a lookahead only; it is never rendered.
      setHasMore(snap.docs.length > PAGE_SIZE);
    } catch (err) {
      console.error('Error loading test reports:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!lastDoc) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(reportsQuery(startAfter(lastDoc), limit(PAGE_SIZE + 1)));
      const page = snap.docs.slice(0, PAGE_SIZE);
      setReports((prev) => [...prev, ...page.map((d) => ({ id: d.id, ...d.data() }))]);
      setLastDoc(page[page.length - 1] || lastDoc);
      setHasMore(snap.docs.length > PAGE_SIZE);
    } catch (err) {
      console.error('Error loading more test reports:', err);
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
        <h1>📝 Test Reports</h1>
        <p>View your test results and performance</p>
      </div>

      {reports.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <h3>No Test Reports Yet</h3>
          <p>Your test results will appear here once your teacher adds them.</p>
        </div>
      ) : (
        <div className="stagger-list">
          {reports.map((report) => {
            const hasSubjects = report.subjects && report.subjects.length > 0;
            const totalObt = hasSubjects
              ? report.subjects.reduce((s, x) => s + x.obtainedMarks, 0)
              : report.obtainedMarks;
            const totalMax = hasSubjects
              ? report.subjects.reduce((s, x) => s + x.totalMarks, 0)
              : report.totalMarks;
            const pct = totalMax ? Math.round((totalObt / totalMax) * 100) : 0;
            const colorClass = pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low';
            const isExpanded = expandedReport === report.id;

            return (
              <div className="card" key={report.id} style={{ marginBottom: 12, cursor: 'pointer' }}
                onClick={() => setExpandedReport(isExpanded ? null : report.id)}
              >
                {/* Summary */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <h4 style={{ fontSize: '1rem', marginBottom: 2 }}>
                      {hasSubjects ? report.subjects.map((s) => s.subjectName).join(', ') : report.subjectName}
                    </h4>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                      {formatDate(report.testDate)}
                      {hasSubjects && <span> • {report.subjects.length} subject{report.subjects.length > 1 ? 's' : ''}</span>}
                    </p>
                  </div>
                  <div style={{
                    fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-heading)',
                    color: pct >= 70 ? 'var(--green-700)' : pct >= 40 ? '#b45309' : 'var(--danger)',
                  }}>
                    {pct}%
                  </div>
                </div>

                {/* Overall bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>
                    {totalObt} / {totalMax}
                  </span>
                  <span className={`badge ${pct >= 70 ? 'badge-success' : pct >= 40 ? 'badge-warning' : 'badge-danger'}`}>
                    {pct >= 70 ? 'Excellent' : pct >= 40 ? 'Average' : 'Improve'}
                  </span>
                </div>
                <div className="progress-bar">
                  <div className={`progress-fill ${colorClass}`} style={{ width: `${pct}%` }}></div>
                </div>

                {/* Expanded subject breakdown */}
                {isExpanded && (
                  <div style={{
                    marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--gray-100)',
                    animation: 'fadeInUp 0.2s ease-out',
                  }}>
                    <div style={{
                      fontSize: '0.6875rem', color: 'var(--gray-400)', textTransform: 'uppercase',
                      letterSpacing: '0.5px', fontWeight: 600, marginBottom: 8,
                    }}>
                      Subject-wise Breakdown
                    </div>
                    {(hasSubjects ? report.subjects : [{ subjectName: report.subjectName, obtainedMarks: report.obtainedMarks, totalMarks: report.totalMarks, remarks: '' }]).map((s, i) => {
                      const sPct = s.totalMarks ? Math.round((s.obtainedMarks / s.totalMarks) * 100) : 0;
                      return (
                        <div key={i} style={{
                          padding: '10px 12px', borderRadius: 'var(--radius-md)',
                          background: 'var(--gray-50)', marginBottom: 6,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.subjectName}</span>
                            <span style={{
                              fontWeight: 700, fontSize: '0.8125rem', fontFamily: 'var(--font-heading)',
                              color: sPct >= 70 ? 'var(--green-700)' : sPct >= 40 ? '#b45309' : 'var(--danger)',
                            }}>
                              {s.obtainedMarks}/{s.totalMarks} ({sPct}%)
                            </span>
                          </div>
                          <div className="progress-bar" style={{ height: 4, marginBottom: s.remarks ? 6 : 0 }}>
                            <div
                              className={`progress-fill ${sPct >= 70 ? '' : sPct >= 40 ? 'medium' : 'low'}`}
                              style={{ width: `${sPct}%` }}
                            ></div>
                          </div>
                          {s.remarks && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', fontStyle: 'italic', marginTop: 4 }}>
                              💬 {s.remarks}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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
              {loadingMore ? 'Loading...' : `Show older (${reports.length} of ${total})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
