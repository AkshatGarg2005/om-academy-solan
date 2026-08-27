import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { loadStudents } from '../../utils/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineX } from 'react-icons/hi';

const EMPTY_SUBJECT = { subjectName: '', obtainedMarks: '', totalMarks: '', remarks: '' };

export default function TestReportForm() {
  const { currentUser, isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0]);
  const [subjects, setSubjects] = useState([{ ...EMPTY_SUBJECT }]);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [expandedReport, setExpandedReport] = useState(null);

  useEffect(() => {
    loadStudentList();
  }, []);

  useEffect(() => {
    if (selectedStudent) loadStudentReports(selectedStudent);
  }, [selectedStudent]);

  async function loadStudentList() {
    setStudents(await loadStudents(isAdmin, currentUser.uid));
  }

  async function loadStudentReports(studentId) {
    setLoadingReports(true);
    try {
      const q = query(
        collection(db, 'testReports'),
        where('studentId', '==', studentId),
        orderBy('testDate', 'desc')
      );
      const snap = await getDocs(q);
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  }

  // --- Subject rows ---
  function updateSubject(index, field, value) {
    setSubjects((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  function addSubjectRow() {
    setSubjects((prev) => [...prev, { ...EMPTY_SUBJECT }]);
  }

  function removeSubjectRow(index) {
    if (subjects.length <= 1) return;
    setSubjects((prev) => prev.filter((_, i) => i !== index));
  }

  // --- Submit ---
  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedStudent) { toast.error('Select a student'); return; }
    if (!testDate) { toast.error('Select a test date'); return; }

    // Validate subjects
    for (let i = 0; i < subjects.length; i++) {
      const s = subjects[i];
      if (!s.subjectName.trim()) { toast.error(`Subject name required (row ${i + 1})`); return; }
      if (s.obtainedMarks === '' || s.totalMarks === '') { toast.error(`Marks required for ${s.subjectName || 'row ' + (i + 1)}`); return; }
      if (Number(s.obtainedMarks) > Number(s.totalMarks)) { toast.error(`Obtained > Total for ${s.subjectName}`); return; }
    }

    setLoading(true);
    try {
      const subjectsData = subjects.map((s) => ({
        subjectName: s.subjectName.trim(),
        obtainedMarks: Number(s.obtainedMarks),
        totalMarks: Number(s.totalMarks),
        remarks: s.remarks.trim(),
      }));

      // Also store legacy flat fields from the first subject for backward compat
      await addDoc(collection(db, 'testReports'), {
        studentId: selectedStudent,
        testDate,
        subjects: subjectsData,
        // Legacy fields (for dashboard recent tests, etc.)
        subjectName: subjectsData.map((s) => s.subjectName).join(', '),
        obtainedMarks: subjectsData.reduce((sum, s) => sum + s.obtainedMarks, 0),
        totalMarks: subjectsData.reduce((sum, s) => sum + s.totalMarks, 0),
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });

      toast.success(`Test report added (${subjectsData.length} subject${subjectsData.length > 1 ? 's' : ''})!`);
      setSubjects([{ ...EMPTY_SUBJECT }]);
      loadStudentReports(selectedStudent);
    } catch (err) {
      toast.error('Failed to add report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(reportId) {
    if (!window.confirm('Delete this test report?')) return;
    try {
      await deleteDoc(doc(db, 'testReports', reportId));
      toast.success('Report deleted');
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err) {
      toast.error('Failed to delete');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>📝 Test Reports</h1>
        <p>Add and manage student test results</p>
      </div>

      {/* Add Form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Add New Test Report</h3>
        <form onSubmit={handleSubmit}>
          {/* Student + Date */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Student</label>
              <select
                className="form-input" value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                id="test-student"
              >
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Test Date</label>
              <input
                type="date" className="form-input" value={testDate}
                onChange={(e) => setTestDate(e.target.value)} id="test-date"
              />
            </div>
          </div>

          {/* Subject Rows */}
          <div style={{
            fontSize: '0.75rem', color: 'var(--gray-400)', textTransform: 'uppercase',
            letterSpacing: '0.5px', fontWeight: 600, marginBottom: 8, marginTop: 8,
          }}>
            Subjects ({subjects.length})
          </div>

          {subjects.map((subject, idx) => (
            <div key={idx} style={{
              padding: '12px', borderRadius: 'var(--radius-md)',
              background: 'var(--gray-50)', marginBottom: 8,
              border: '1px solid var(--gray-100)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--green-700)' }}>
                  Subject {idx + 1}
                </span>
                {subjects.length > 1 && (
                  <button
                    type="button" className="btn-icon btn-sm"
                    style={{ color: 'var(--danger)', padding: 2 }}
                    onClick={() => removeSubjectRow(idx)} title="Remove subject"
                  >
                    <HiOutlineX />
                  </button>
                )}
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Subject Name</label>
                  <input
                    type="text" className="form-input" placeholder="e.g., Mathematics"
                    value={subject.subjectName}
                    onChange={(e) => updateSubject(idx, 'subjectName', e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '0.875rem' }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Obtained</label>
                  <input
                    type="number" className="form-input" placeholder="75"
                    value={subject.obtainedMarks} min="0"
                    onChange={(e) => updateSubject(idx, 'obtainedMarks', e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '0.875rem' }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Total</label>
                  <input
                    type="number" className="form-input" placeholder="100"
                    value={subject.totalMarks} min="1"
                    onChange={(e) => updateSubject(idx, 'totalMarks', e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '0.875rem' }}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 4 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Remarks</label>
                <input
                  type="text" className="form-input" placeholder="Optional remarks for this subject"
                  value={subject.remarks}
                  onChange={(e) => updateSubject(idx, 'remarks', e.target.value)}
                  style={{ padding: '8px 10px', fontSize: '0.875rem' }}
                />
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button" className="btn btn-secondary btn-sm"
              onClick={addSubjectRow}
            >
              <HiOutlinePlus /> Add Subject
            </button>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} id="test-submit" style={{ marginTop: 16 }}>
            <HiOutlinePlus /> {loading ? 'Adding...' : `Add Report (${subjects.length} subject${subjects.length > 1 ? 's' : ''})`}
          </button>
        </form>
      </div>

      {/* Existing Reports */}
      {selectedStudent && (
        <>
          <div className="section-title">
            <h2>Reports for {students.find((s) => s.id === selectedStudent)?.name}</h2>
          </div>
          {loadingReports ? (
            <div className="spinner-overlay" style={{ minHeight: 100 }}>
              <div className="spinner"></div>
            </div>
          ) : reports.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <p>No reports yet for this student</p>
            </div>
          ) : (
            <div className="stagger-list">
              {reports.map((r) => {
                const hasSubjects = r.subjects && r.subjects.length > 0;
                const totalObt = hasSubjects ? r.subjects.reduce((s, x) => s + x.obtainedMarks, 0) : r.obtainedMarks;
                const totalMax = hasSubjects ? r.subjects.reduce((s, x) => s + x.totalMarks, 0) : r.totalMarks;
                const pct = totalMax ? Math.round((totalObt / totalMax) * 100) : 0;
                const isExpanded = expandedReport === r.id;

                return (
                  <div className="card" key={r.id} style={{ marginBottom: 10 }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                      onClick={() => setExpandedReport(isExpanded ? null : r.id)}
                    >
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: pct >= 70 ? 'var(--green-100)' : pct >= 40 ? 'var(--warning-light)' : 'var(--danger-light)',
                        color: pct >= 70 ? 'var(--green-700)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)',
                        fontWeight: 700, fontSize: '0.875rem', flexShrink: 0,
                      }}>
                        {pct}%
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ fontSize: '0.9375rem', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {hasSubjects ? r.subjects.map((s) => s.subjectName).join(', ') : r.subjectName}
                        </h4>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                          {totalObt}/{totalMax} • {formatDate(r.testDate)}
                          {hasSubjects && <span> • {r.subjects.length} subject{r.subjects.length > 1 ? 's' : ''}</span>}
                        </p>
                      </div>
                      <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} title="Delete">
                        <HiOutlineTrash />
                      </button>
                    </div>

                    {/* Expanded subject breakdown */}
                    {isExpanded && hasSubjects && (
                      <div style={{
                        marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gray-100)',
                        animation: 'fadeInUp 0.2s ease-out',
                      }}>
                        {r.subjects.map((s, i) => {
                          const sPct = s.totalMarks ? Math.round((s.obtainedMarks / s.totalMarks) * 100) : 0;
                          return (
                            <div key={i} style={{
                              padding: '8px 10px', borderRadius: 'var(--radius-md)',
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
