import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { loadBatches, commitInChunks } from '../../utils/firestore';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { HiOutlineClipboardCheck } from 'react-icons/hi';
import { todayLocalISO } from '../../utils/helpers';

export default function AttendanceForm() {
  const { currentUser, isAdmin } = useAuth();
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [date, setDate] = useState(todayLocalISO);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [existingRecords, setExistingRecords] = useState({}); // studentId -> docId
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);
  // Bumped per request. Switching batch or date fires overlapping reads, and
  // without these an earlier response landing last would leave the roster and
  // the selected batch out of step — attendance would then be written for one
  // batch's students under another batch's id.
  const rosterRequest = useRef(0);
  const existingRequest = useRef(0);

  useEffect(() => {
    loadBatchList();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      loadBatchStudents(selectedBatch);
    } else {
      // Going back to "Select batch" has to clear the roster too, otherwise the
      // previous batch's students stay on screen under a blank selection.
      setStudents([]);
      setAttendance({});
      setExistingRecords({});
      setIsUpdate(false);
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

  async function loadBatchList() {
    setBatches(await loadBatches());
  }

  async function loadBatchStudents(batchId) {
    const token = (rosterRequest.current += 1);
    // Any existing-attendance read still in flight belongs to the old batch.
    existingRequest.current += 1;
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('role', '==', 'student'),
        where('batchIds', 'array-contains', batchId)
      ));
      if (token !== rosterRequest.current) return; // superseded by a later batch
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
      if (token === rosterRequest.current) setLoading(false);
    }
  }

  async function loadExistingAttendance() {
    const token = (existingRequest.current += 1);
    try {
      const q = query(
        collection(db, 'attendance'),
        where('batchId', '==', selectedBatch),
        where('date', '==', date)
      );
      const snap = await getDocs(q);
      if (token !== existingRequest.current) return; // superseded by a later batch/date
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
      // Committed as one batch rather than a request per student: a single
      // round trip, one security-rule evaluation instead of one per write, and
      // atomic, so a failure part way through cannot half-save the register.
      const ops = students.map((student) => {
        const existingDocId = existingRecords[student.id];
        const present = attendance[student.id] ?? true;
        if (existingDocId) {
          // Update existing record
          return (b) => b.update(doc(db, 'attendance', existingDocId), {
            present,
            markedBy: currentUser.uid,
            updatedAt: serverTimestamp(),
          });
        }
        // Create new record. doc() with no id mints a reference up front, which
        // is what addDoc does internally before its own round trip.
        const ref = doc(collection(db, 'attendance'));
        return (b) => b.set(ref, {
          studentId: student.id,
          batchId: selectedBatch,
          date,
          present,
          markedBy: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      });
      await commitInChunks(ops);
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

  // Counted over the students actually listed. `attendance` can carry extra
  // entries — records for students in the batch but assigned to another teacher,
  // or students since removed from the batch — and counting those made the
  // summary read impossible things like "20/5 Present".
  const presentCount = students.filter((s) => attendance[s.id] ?? true).length;

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
