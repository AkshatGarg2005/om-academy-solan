import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { loadStudents, queryByIds } from '../../utils/firestore';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus, HiOutlineCheckCircle, HiOutlineXCircle,
  HiOutlineChevronDown, HiOutlineChevronUp, HiOutlinePencil,
  HiOutlineTrash, HiOutlineCheck, HiOutlineX,
} from 'react-icons/hi';
import { getInitials, formatDate } from '../../utils/helpers';

export default function FeeForm() {
  const { currentUser, isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [month, setMonth] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [fees, setFees] = useState([]);
  const [adding, setAdding] = useState(false);
  const [pendingFees, setPendingFees] = useState([]);
  const [showPending, setShowPending] = useState(true);
  // Edit state
  const [editFeeId, setEditFeeId] = useState(null);
  const [editMonth, setEditMonth] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [saving, setSaving] = useState(false);

  // Derived from pendingFees so that adding, editing, paying or deleting a fee
  // can update local state instead of refetching the roster and every unpaid fee.
  const pendingByStudent = useMemo(() => {
    const grouped = {};
    pendingFees.forEach((fee) => {
      if (!grouped[fee.studentId]) {
        const student = students.find((s) => s.id === fee.studentId);
        grouped[fee.studentId] = {
          student: student || { id: fee.studentId, name: 'Unknown' },
          fees: [],
          totalAmount: 0,
        };
      }
      grouped[fee.studentId].fees.push(fee);
      grouped[fee.studentId].totalAmount += (fee.amount || 0);
    });
    return Object.values(grouped);
  }, [pendingFees, students]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedStudent) loadStudentFees(selectedStudent);
  }, [selectedStudent]);

  async function loadInitialData() {
    try {
      const studentList = await loadStudents(isAdmin, currentUser.uid);
      setStudents(studentList);

      // Teachers see only their own students' pending fees. The unscoped query
      // this replaces returned every unpaid fee in the school, so a teacher's
      // pending total included other teachers' students, listed as "Unknown".
      const pending = isAdmin
        ? (await getDocs(query(collection(db, 'fees'), where('paid', '==', false)))).docs
            .map((d) => ({ id: d.id, ...d.data() }))
        : await queryByIds(
            'fees',
            'studentId',
            studentList.map((s) => s.id),
            where('paid', '==', false)
          );
      setPendingFees(pending);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentFees(studentId) {
    try {
      const q = query(collection(db, 'fees'), where('studentId', '==', studentId));
      const snap = await getDocs(q);
      setFees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!selectedStudent || !month.trim()) {
      toast.error('Select student and enter month');
      return;
    }
    setAdding(true);
    try {
      const fee = {
        studentId: selectedStudent,
        month: month.trim(),
        dueDate: dueDate || '',
        amount: Number(amount) || 0,
        paid: false,
      };
      const ref = await addDoc(collection(db, 'fees'), {
        ...fee,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const added = { id: ref.id, ...fee };
      setFees((prev) => [...prev, added]);
      setPendingFees((prev) => [...prev, added]);
      toast.success('Fee record added');
      setMonth('');
      setDueDate('');
      setAmount('');
    } catch (err) {
      toast.error('Failed to add fee');
    } finally {
      setAdding(false);
    }
  }

  async function togglePaid(feeId, currentPaid) {
    try {
      await updateDoc(doc(db, 'fees', feeId), {
        paid: !currentPaid,
        updatedAt: serverTimestamp(),
      });
      toast.success(currentPaid ? 'Marked as unpaid' : 'Marked as paid');
      const toggled = fees.find((f) => f.id === feeId);
      setFees((prev) =>
        prev.map((f) => (f.id === feeId ? { ...f, paid: !currentPaid } : f))
      );
      // A fee that was paid becomes pending again, and vice versa.
      setPendingFees((prev) =>
        currentPaid
          ? [...prev, { ...toggled, paid: false }]
          : prev.filter((f) => f.id !== feeId)
      );
    } catch (err) {
      toast.error('Failed to update');
    }
  }

  // --- Edit ---
  function startEdit(fee) {
    setEditFeeId(fee.id);
    setEditMonth(fee.month || '');
    setEditDueDate(fee.dueDate || '');
    setEditAmount(String(fee.amount || ''));
  }

  function cancelEdit() {
    setEditFeeId(null);
    setEditMonth('');
    setEditDueDate('');
    setEditAmount('');
  }

  async function saveEdit(feeId) {
    if (!editMonth.trim()) { toast.error('Month is required'); return; }
    setSaving(true);
    try {
      const updated = {
        month: editMonth.trim(),
        dueDate: editDueDate || '',
        amount: Number(editAmount) || 0,
      };
      await updateDoc(doc(db, 'fees', feeId), { ...updated, updatedAt: serverTimestamp() });
      const applyEdit = (list) => list.map((f) => (f.id === feeId ? { ...f, ...updated } : f));
      setFees(applyEdit);
      setPendingFees(applyEdit);
      toast.success('Fee entry updated');
      setEditFeeId(null);
    } catch (err) {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  }

  // --- Delete ---
  async function handleDeleteFee(feeId) {
    if (!window.confirm('Delete this fee entry?')) return;
    try {
      await deleteDoc(doc(db, 'fees', feeId));
      toast.success('Fee entry deleted');
      const removeFee = (list) => list.filter((f) => f.id !== feeId);
      setFees(removeFee);
      setPendingFees(removeFee);
    } catch (err) {
      toast.error('Failed to delete');
    }
  }

  function getDueLabel(dueDateStr) {
    if (!dueDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { text: `Overdue by ${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''}`, color: 'var(--danger)' };
    if (diff === 0) return { text: 'Due today', color: 'var(--danger)' };
    if (diff <= 7) return { text: `Due in ${diff} day${diff > 1 ? 's' : ''}`, color: '#b45309' };
    return { text: `Due ${formatDate(dueDateStr)}`, color: 'var(--gray-500)' };
  }

  if (loading) {
    return <div className="spinner-overlay"><div className="spinner"></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>💰 Manage Fees</h1>
        <p>Add fee records and update payment status</p>
      </div>

      {/* Pending Fees Summary */}
      {pendingByStudent.length > 0 && (
        <div className="card" style={{
          marginBottom: 24, borderLeft: '4px solid var(--danger)', background: 'var(--white)',
        }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setShowPending(!showPending)}
          >
            <div>
              <h3 style={{ fontSize: '1rem', color: 'var(--danger)', marginBottom: 2 }}>
                ⚠️ Pending Fees
              </h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                {pendingByStudent.length} student{pendingByStudent.length > 1 ? 's' : ''} with unpaid fees
                 • Total: <span style={{ fontWeight: 700, color: 'var(--danger)' }}>₹{pendingByStudent.reduce((sum, s) => sum + s.totalAmount, 0)}</span>
              </p>
            </div>
            <span style={{ color: 'var(--gray-400)', fontSize: '1.25rem' }}>
              {showPending ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
            </span>
          </div>

          {showPending && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingByStudent.map(({ student, fees: pendingFees, totalAmount }) => (
                <div
                  key={student.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 'var(--radius-md)',
                    background: 'var(--gray-50)', cursor: 'pointer',
                  }}
                  onClick={() => setSelectedStudent(student.id)}
                >
                  <div className="avatar" style={{ width: 36, height: 36, fontSize: '0.75rem', flexShrink: 0 }}>
                    {getInitials(student.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{
                      fontSize: '0.875rem', marginBottom: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {student.name}
                    </h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                      {pendingFees.map((f) => f.month).join(', ')}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.9375rem', fontWeight: 700, color: 'var(--danger)',
                      fontFamily: 'var(--font-heading)',
                    }}>
                      ₹{totalAmount}
                    </span>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
                      {pendingFees.length} pending
                    </p>
                  </div>
                </div>
              ))}

              {/* Grand Total */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', borderRadius: 'var(--radius-md)',
                background: 'var(--danger-light)', marginTop: 4,
                borderTop: '2px solid var(--danger)',
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--gray-700)' }}>
                  Total Pending
                </span>
                <span style={{
                  fontSize: '1.125rem', fontWeight: 700, color: 'var(--danger)',
                  fontFamily: 'var(--font-heading)',
                }}>
                  ₹{pendingByStudent.reduce((sum, s) => sum + s.totalAmount, 0)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Add Fee Entry</h3>
        <form onSubmit={handleAdd}>
          <div className="form-group">
            <label className="form-label">Student</label>
            <select
              className="form-input" value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)} id="fee-student"
            >
              <option value="">Select student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Month / Period</label>
              <input
                type="text" className="form-input" placeholder="e.g., June 2026"
                value={month} onChange={(e) => setMonth(e.target.value)} id="fee-month"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input
                type="date" className="form-input"
                value={dueDate} onChange={(e) => setDueDate(e.target.value)} id="fee-due-date"
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Amount (₹)</label>
            <input
              type="number" className="form-input" placeholder="e.g., 2000"
              value={amount} onChange={(e) => setAmount(e.target.value)} min="0" id="fee-amount"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={adding} id="fee-submit">
            <HiOutlinePlus /> {adding ? 'Adding...' : 'Add Fee Entry'}
          </button>
        </form>
      </div>

      {/* Fee Records */}
      {selectedStudent && (
        <>
          <div className="section-title">
            <h2>Fee Records for {students.find((s) => s.id === selectedStudent)?.name}</h2>
          </div>
          {fees.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <p>No fee records for this student</p>
            </div>
          ) : (
            <div className="stagger-list">
              {fees.map((fee) => {
                const dueLabel = !fee.paid ? getDueLabel(fee.dueDate) : null;
                const isEditing = editFeeId === fee.id;

                return (
                  <div className="card" key={fee.id} style={{
                    marginBottom: 8,
                    borderLeft: `4px solid ${fee.paid ? 'var(--green-500)' : 'var(--danger)'}`,
                  }}>
                    {isEditing ? (
                      /* Edit Mode */
                      <div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Month</label>
                            <input type="text" className="form-input" value={editMonth}
                              onChange={(e) => setEditMonth(e.target.value)}
                              style={{ padding: '6px 10px', fontSize: '0.875rem' }}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Due Date</label>
                            <input type="date" className="form-input" value={editDueDate}
                              onChange={(e) => setEditDueDate(e.target.value)}
                              style={{ padding: '6px 10px', fontSize: '0.875rem' }}
                            />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>Amount (₹)</label>
                          <input type="number" className="form-input" value={editAmount} min="0"
                            onChange={(e) => setEditAmount(e.target.value)}
                            style={{ padding: '6px 10px', fontSize: '0.875rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveEdit(fee.id)}>
                            <HiOutlineCheck /> {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                            <HiOutlineX /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ fontSize: '0.9375rem', marginBottom: 2 }}>{fee.month}</h4>
                          <p style={{ fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
                            ₹{fee.amount || '—'}
                          </p>
                          {dueLabel && (
                            <p style={{ fontSize: '0.75rem', color: dueLabel.color, fontWeight: 600, marginTop: 2 }}>
                              ⏰ {dueLabel.text}
                            </p>
                          )}
                          {fee.dueDate && fee.paid && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 2 }}>
                              Due was {formatDate(fee.dueDate)}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => togglePaid(fee.id, fee.paid)}
                            style={{
                              minWidth: 80,
                              background: fee.paid ? 'var(--green-500)' : 'var(--danger)',
                              color: 'var(--white)',
                              border: 'none',
                            }}
                          >
                            {fee.paid ? <><HiOutlineCheckCircle /> Paid</> : <><HiOutlineXCircle /> Unpaid</>}
                          </button>
                          <button className="btn-icon btn-sm" style={{ color: 'var(--info)' }} onClick={() => startEdit(fee)} title="Edit">
                            <HiOutlinePencil />
                          </button>
                          <button className="btn-icon btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteFee(fee.id)} title="Delete">
                            <HiOutlineTrash />
                          </button>
                        </div>
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
