import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { HiOutlineClipboardCheck } from 'react-icons/hi';

export default function AttendanceForm() {
  const { currentUser, isAdmin } = useAuth();
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [date, setDate] = useState(localDate);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [existingRecords, setExistingRecords] = useState({}); // studentId -> docId
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      loadBatchStudents(selectedBatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatch]);

  // When date or batch changes, check for existing records
  useEffect(() => {
    if (selectedBatch && date && students.length > 0) {
      loadExistingAttendance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, students]);

  async function loadBatches() {
    const snap = await getDocs(collection(db, 'batches'));
    setBatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadBatchStudents(batchId) {
    setLoading(true);
    try {
      let q;
      if (isAdmin) {
        q = query(
          collection(db, 'users'),
          where('role', '==', 'student'),
          where('batchIds', 'array-contains', batchId)
        );
      } else {
        // Teacher: students in this batch who are also assigned to this teacher
        q = query(
          collection(db, 'users'),
          where('role', '==', 'student'),
          where('batchIds', 'array-contains', batchId)
        );
      }
      const snap = await getDocs(q);
      let studentList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // For teachers, filter to only their assigned students
      if (!isAdmin) {
        studentList = studentList.filter((s) => (s.teacherIds || []).includes(currentUser.uid));
      }
      setStudents(studentList);
      // Default all to present
      const defaultAttendance = {};
      studentList.forEach((s) => { defaultAttendance[s.id] = true; });
      setAttendance(defaultAttendance);
      setExistingRecords({});
      setIsUpdate(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadExistingAttendance() {
    try {
      const q = query(
        collection(db, 'attendance'),
        where('batchId', '==', selectedBatch),
        where('date', '==', date)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        // No existing records — fresh entry
        setIsUpdate(false);
        setExistingRecords({});
        const defaultAttendance = {};
        students.forEach((s) => { defaultAttendance[s.id] = true; });
        setAttendance(defaultAttendance);
        return;
      }
      // Existing records found — load values
      const existing = {};
      const attendanceState = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        existing[data.studentId] = d.id;
        attendanceState[data.studentId] = data.present;
      });
      // Fill missing students (newly added to batch) as present
      students.forEach((s) => {
        if (!(s.id in attendanceState)) {
          attendanceState[s.id] = true;
        }
      });
      setExistingRecords(existing);
      setAttendance(attendanceState);
      setIsUpdate(true);
    } catch (err) {
      console.error('Error loading existing attendance:', err);
    }
  }

  function toggleAttendance(studentId) {
    setAttendance((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedBatch || students.length === 0) {
      toast.error('Select a batch with students');
      return;
    }
    setSubmitting(true);
    try {
      const ops = [];
      for (const student of students) {
        const existingDocId = existingRecords[student.id];
        if (existingDocId) {
          // Update existing record
          ops.push(
            updateDoc(doc(db, 'attendance', existingDocId), {
              present: attendance[student.id] ?? true,
              markedBy: currentUser.uid,
              updatedAt: serverTimestamp(),
            })
          );
        } else {
          // Create new record
          ops.push(
            addDoc(collection(db, 'attendance'), {
              studentId: student.id,
              batchId: selectedBatch,
              date,
              present: attendance[student.id] ?? true,
              markedBy: currentUser.uid,
              createdAt: serverTimestamp(),
            })
          );
        }
      }
      await Promise.all(ops);
      const action = isUpdate ? 'updated' : 'marked';
      toast.success(`Attendance ${action} for ${students.length} students!`);
      // Reload to reflect saved state
      await loadExistingAttendance();
    } catch (err) {
      toast.error('Failed to save attendance');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  const presentCount = Object.values(attendance).filter(Boolean).length;

  return (
    <div className="page">
      <div className="page-header">
        <h1>✅ Mark Attendance</h1>
        <p>Select batch and mark daily attendance</p>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Batch</label>
            <select
              className="form-input"
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              id="att-batch"
            >
              <option value="">Select batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.timing ? ` (${b.timing})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              id="att-date"
            />
          </div>
        </div>
      </div>

      {/* Update indicator */}
      {isUpdate && (
        <div style={{
          padding: '8px 14px', background: 'var(--info-light)', borderRadius: 'var(--radius-md)',
          marginBottom: 12, fontSize: '0.8125rem', color: 'var(--info)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ℹ️ Attendance already exists for this date. Saving will update it.
        </div>
      )}

      {/* Student List */}
      {loading ? (
        <div className="spinner-overlay" style={{ minHeight: 100 }}>
          <div className="spinner"></div>
        </div>
      ) : selectedBatch && students.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <h3>No Students in This Batch</h3>
          <p>Assign students to this batch first.</p>
        </div>
      ) : students.length > 0 ? (
        <form onSubmit={handleSubmit}>
          {/* Summary bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 16px', background: 'var(--green-50)', borderRadius: 'var(--radius-md)',
            marginBottom: 12, fontSize: '0.875rem', fontWeight: 600,
          }}>
            <span style={{ color: 'var(--green-800)' }}>
              {presentCount}/{students.length} Present
            </span>
            <span style={{ color: 'var(--gray-500)' }}>
              {students.length - presentCount} Absent
            </span>
          </div>

          <div className="stagger-list">
            {students.map((student) => (
              <div
                className="checkbox-row"
                key={student.id}
                onClick={() => toggleAttendance(student.id)}
                style={{
                  cursor: 'pointer',
                  borderColor: attendance[student.id] ? 'var(--green-200)' : 'var(--gray-200)',
                  background: attendance[student.id] ? 'var(--green-50)' : 'var(--white)',
                }}
              >
                <input
                  type="checkbox"
                  checked={attendance[student.id] ?? true}
                  onChange={() => toggleAttendance(student.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--gray-800)' }}>
                    {student.name}
                  </span>
                </div>
                <span className={`badge ${attendance[student.id] ? 'badge-success' : 'badge-danger'}`}>
                  {attendance[student.id] ? 'P' : 'A'}
                </span>
              </div>
            ))}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting}
            style={{ marginTop: 16 }}
            id="att-submit"
          >
            <HiOutlineClipboardCheck />
            {submitting ? 'Saving...' : isUpdate ? 'Update Attendance' : 'Save Attendance'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
