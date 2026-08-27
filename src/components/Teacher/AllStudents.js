import React, { useState, useEffect } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseConfig } from '../../config/firebase';
import {
  loadStudents, loadBatches, loadTeachers,
  invalidateStudents, commitInChunks,
} from '../../utils/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { getInitials } from '../../utils/helpers';

import toast from 'react-hot-toast';
import {
  HiOutlineSearch, HiOutlineTrash, HiOutlinePlus,
  HiOutlineX,
} from 'react-icons/hi';

export default function AllStudents() {
  const { currentUser, isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);

  const [form, setForm] = useState({
    name: '', studentPhone: '', email: '', password: '',
    aadhaar: '', dob: '', address: '', previousEducation: '',
    mothersName: '', fathersName: '', guardianName: '', guardianPhone: '',
    dateOfAdmission: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Shared with the other staff screens, so moving between them no longer
      // re-downloads the roster and batch list each time.
      const [studentList, batchList, teacherList] = await Promise.all([
        loadStudents(isAdmin, currentUser.uid),
        loadBatches(),
        isAdmin ? loadTeachers() : Promise.resolve([]),
      ]);
      setStudents(studentList);
      setBatches(batchList);
      setTeachers(teacherList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = students.filter((s) => {
    const matchSearch = !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase());
    const matchBatch = !filterBatch || (s.batchIds || []).includes(filterBatch);
    const matchTeacher = !filterTeacher
      ? true
      : filterTeacher === 'unassigned'
        ? !(s.teacherIds?.length > 0)
        : (s.teacherIds || []).includes(filterTeacher);
    return matchSearch && matchBatch && matchTeacher;
  });

  function getBatchNames(batchIds) {
    if (!batchIds || batchIds.length === 0) return '—';
    return batchIds.map((id) => {
      const batch = batches.find((b) => b.id === id);
      return batch ? batch.name : '';
    }).filter(Boolean).join(', ') || '—';
  }

  // --- Delete Student ---
  async function handleDelete(studentId, studentName) {
    if (!window.confirm(`Delete "${studentName}"?\n\nThis will remove the student profile and all their attendance, test, and fee records. The login account will remain (must be deleted from Firebase Console).`)) return;
    try {
      // Delete related records
      const [attSnap, testSnap, feeSnap] = await Promise.all([
        getDocs(query(collection(db, 'attendance'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'testReports'), where('studentId', '==', studentId))),
        getDocs(query(collection(db, 'fees'), where('studentId', '==', studentId))),
      ]);
      // Committed as batches so a mid-flight failure cannot leave the student
      // deleted but their records behind (or the reverse).
      const deletes = [];
      attSnap.docs.forEach((d) => deletes.push((b) => b.delete(doc(db, 'attendance', d.id))));
      testSnap.docs.forEach((d) => deletes.push((b) => b.delete(doc(db, 'testReports', d.id))));
      feeSnap.docs.forEach((d) => deletes.push((b) => b.delete(doc(db, 'fees', d.id))));
      deletes.push((b) => b.delete(doc(db, 'users', studentId)));
      await commitInChunks(deletes);
      // Drop from local state rather than refetching the roster and batches.
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
      invalidateStudents();
      toast.success(`${studentName} deleted`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete student');
    }
  }

  // --- Add Student ---
  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }



  function resetAddForm() {
    setForm({
      name: '', studentPhone: '', email: '', password: '',
      aadhaar: '', dob: '', address: '', previousEducation: '',
      mothersName: '', fathersName: '', guardianName: '', guardianPhone: '',
      dateOfAdmission: new Date().toISOString().split('T')[0],
    });

    setShowAddForm(false);
  }

  async function handleAddStudent(e) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.email.trim()) { toast.error('Email is required'); return; }
    if (!form.password || form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }

    setAdding(true);
    try {


      // Use a secondary Firebase app to create the user without signing out the teacher
      const secondaryApp = initializeApp(firebaseConfig, 'secondary-' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);

      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);
      await signOut(secondaryAuth);

      // Create Firestore user document
      const student = {
        name: form.name.trim(),
        studentPhone: form.studentPhone.trim(),
        email: form.email.trim(),

        aadhaar: form.aadhaar.trim(),
        dob: form.dob,
        address: form.address.trim(),
        previousEducation: form.previousEducation.trim(),
        mothersName: form.mothersName.trim(),
        fathersName: form.fathersName.trim(),
        guardianName: form.guardianName.trim(),
        guardianPhone: form.guardianPhone.trim(),
        dateOfAdmission: form.dateOfAdmission,
        role: 'student',
        teacherIds: isAdmin ? [] : [currentUser.uid],
        batchIds: [],
        courseIds: [],
      };
      await setDoc(doc(db, 'users', cred.user.uid), {
        ...student,
        createdAt: serverTimestamp(),
      });

      // Clean up secondary app
      await deleteApp(secondaryApp);

      // Append locally rather than refetching the roster and batches.
      setStudents((prev) => [...prev, { id: cred.user.uid, ...student }]);
      invalidateStudents();
      toast.success(`${form.name.trim()} added successfully!`);
      resetAddForm();
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        toast.error('An account with this email already exists');
      } else {
        toast.error(err.message || 'Failed to add student');
      }
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return <div className="spinner-overlay"><div className="spinner"></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>👥 All Students</h1>
        <p>{students.length} students registered</p>
      </div>

      {/* Add Student Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          className={`btn ${showAddForm ? 'btn-secondary' : 'btn-primary'} btn-sm`}
          onClick={() => showAddForm ? resetAddForm() : setShowAddForm(true)}
          id="add-student-btn"
        >
          {showAddForm ? <><HiOutlineX /> Cancel</> : <><HiOutlinePlus /> Add Student</>}
        </button>
      </div>

      {/* Add Student Form */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Add New Student</h3>
          <form onSubmit={handleAddStudent}>


            {/* Core fields */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input type="text" className="form-input" placeholder="Student name" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Student Phone</label>
                <input type="tel" className="form-input" placeholder="Phone number" value={form.studentPhone} onChange={(e) => updateField('studentPhone', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input type="email" className="form-input" placeholder="Email address" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Password *</label>
                <input type="text" className="form-input" placeholder="Min 6 characters" value={form.password} onChange={(e) => updateField('password', e.target.value)} />
              </div>
            </div>

            {/* Personal */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">DOB</label>
                <input type="date" className="form-input" value={form.dob} onChange={(e) => updateField('dob', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Aadhaar</label>
                <input type="text" className="form-input" placeholder="XXXX XXXX XXXX" maxLength={14} value={form.aadhaar} onChange={(e) => updateField('aadhaar', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea className="form-input" placeholder="Full address" rows={2} value={form.address} onChange={(e) => updateField('address', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Previous Education</label>
              <input type="text" className="form-input" placeholder="e.g., 10th Pass" value={form.previousEducation} onChange={(e) => updateField('previousEducation', e.target.value)} />
            </div>

            {/* Family */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Mother's Name</label>
                <input type="text" className="form-input" value={form.mothersName} onChange={(e) => updateField('mothersName', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Father's Name</label>
                <input type="text" className="form-input" value={form.fathersName} onChange={(e) => updateField('fathersName', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Guardian Name</label>
                <input type="text" className="form-input" value={form.guardianName} onChange={(e) => updateField('guardianName', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Guardian Phone</label>
                <input type="tel" className="form-input" placeholder="10-digit phone" value={form.guardianPhone} onChange={(e) => updateField('guardianPhone', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Date of Admission</label>
              <input type="date" className="form-input" value={form.dateOfAdmission} onChange={(e) => updateField('dateOfAdmission', e.target.value)} />
            </div>

            <button type="submit" className="btn btn-primary" disabled={adding} id="add-student-submit">
              {adding ? 'Creating...' : <><HiOutlinePlus /> Create Student Account</>}
            </button>
          </form>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
          <HiOutlineSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="students-search"
          />
        </div>
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: 140, padding: '10px 14px' }}
          value={filterBatch}
          onChange={(e) => setFilterBatch(e.target.value)}
          id="students-filter-batch"
        >
          <option value="">All Batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        {isAdmin && (
          <select
            className="form-input"
            style={{ width: 'auto', minWidth: 140, padding: '10px 14px' }}
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            id="students-filter-teacher"
          >
            <option value="">All Teachers</option>
            <option value="unassigned">⚠️ Unassigned</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Student List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3>No Students Found</h3>
          <p>Try adjusting your search or filter.</p>
        </div>
      ) : (
        <div className="stagger-list">
          {filtered.map((student) => (
            <div
              key={student.id}
              className="card"
              style={{ marginBottom: 10 }}
            >
              {/* Summary Row */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                onClick={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
              >
                <div className="avatar">
                  {getInitials(student.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontSize: '0.9375rem', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {student.name}
                  </h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {student.email}
                  </p>
                </div>
                <span className="badge badge-info" style={{ fontSize: '0.6875rem' }}>
                  {getBatchNames(student.batchIds)}
                </span>
              </div>

              {/* Expanded Details */}
              {expandedStudent === student.id && (
                <div style={{
                  marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--gray-100)',
                  animation: 'fadeInUp 0.2s ease-out',
                }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: '0.8125rem',
                  }}>
                    <DetailField label="Phone" value={student.studentPhone} />
                    <DetailField label="DOB" value={student.dob} />
                    <DetailField label="Aadhaar" value={student.aadhaar} />
                    <DetailField label="Father" value={student.fathersName} />
                    <DetailField label="Mother" value={student.mothersName} />
                    <DetailField label="Guardian" value={student.guardianName} />
                    <DetailField label="Guardian Phone" value={student.guardianPhone} />
                    <DetailField label="Previous Education" value={student.previousEducation} />
                    <div style={{ gridColumn: '1 / -1' }}>
                      <DetailField label="Address" value={student.address} />
                    </div>
                    <DetailField label="Admission Date" value={student.dateOfAdmission} />
                  </div>

                  {/* Delete button — admin only, matching the security rules.
                      Shown to teachers previously, where it always failed part
                      way through and left records behind. */}
                  {isAdmin && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-sm"
                        style={{ color: 'var(--danger)', background: 'var(--danger-light)', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); handleDelete(student.id, student.name); }}
                      >
                        <HiOutlineTrash /> Delete Student
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <span style={{ color: 'var(--gray-400)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 600 }}>
        {label}
      </span>
      <p style={{ color: 'var(--gray-700)' }}>{value || '—'}</p>
    </div>
  );
}
