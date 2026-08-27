import React, { useState, useEffect } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseConfig } from '../../config/firebase';
import { getInitials } from '../../utils/helpers';
import { countDocs } from '../../utils/firestore';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus, HiOutlineTrash, HiOutlineX, HiOutlineSearch,
  HiOutlinePencil, HiOutlineCheck,
} from 'react-icons/hi';

export default function ManageTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedTeacher, setExpandedTeacher] = useState(null);
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '', subject: '',
  });

  // Edit state
  const [editTeacherId, setEditTeacherId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTeachers();
  }, []);

  async function loadTeachers() {
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
      const teacherList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Count each teacher's students server-side, rather than downloading the
      // entire student roster just to tally it here.
      const studentCounts = await Promise.all(
        teacherList.map((t) =>
          countDocs(
            query(
              collection(db, 'users'),
              where('role', '==', 'student'),
              where('teacherIds', 'array-contains', t.id)
            )
          )
        )
      );
      setTeachers(teacherList.map((t, i) => ({ ...t, studentCount: studentCounts[i] })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setForm({ name: '', email: '', password: '', phone: '', subject: '' });
    setShowAddForm(false);
  }

  async function handleAddTeacher(e) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Teacher name is required'); return; }
    if (!form.email.trim()) { toast.error('Email is required'); return; }
    if (!form.password || form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }

    setAdding(true);
    try {
      // Use secondary app to avoid logging out admin
      const secondaryApp = initializeApp(firebaseConfig, 'secondary-teacher-' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);

      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);
      await signOut(secondaryAuth);

      const teacher = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        subject: form.subject.trim(),
        role: 'teacher',
      };
      await setDoc(doc(db, 'users', cred.user.uid), {
        ...teacher,
        createdAt: serverTimestamp(),
      });

      await deleteApp(secondaryApp);

      // Append locally rather than reloading and re-counting every teacher.
      setTeachers((prev) => [...prev, { id: cred.user.uid, ...teacher, studentCount: 0 }]);
      toast.success(`${form.name.trim()} added as teacher!`);
      resetForm();
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        toast.error('An account with this email already exists');
      } else {
        toast.error(err.message || 'Failed to add teacher');
      }
    } finally {
      setAdding(false);
    }
  }

  // --- Edit Teacher ---
  function startEdit(teacher) {
    setEditTeacherId(teacher.id);
    setEditForm({
      name: teacher.name || '',
      phone: teacher.phone || '',
      subject: teacher.subject || '',
    });
    setExpandedTeacher(teacher.id);
  }

  function cancelEdit() {
    setEditTeacherId(null);
    setEditForm({});
  }

  async function handleSaveEdit() {
    if (!editForm.name?.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const updated = {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        subject: editForm.subject.trim(),
      };
      await updateDoc(doc(db, 'users', editTeacherId), {
        ...updated,
        updatedAt: serverTimestamp(),
      });
      setTeachers((prev) =>
        prev.map((t) => (t.id === editTeacherId ? { ...t, ...updated } : t))
      );
      toast.success('Teacher updated!');
      setEditTeacherId(null);
      setEditForm({});
    } catch (err) {
      console.error(err);
      toast.error('Failed to update teacher');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(teacherId, teacherName) {
    if (!window.confirm(`Delete teacher "${teacherName}"?\n\nThis will remove their profile. Their login account must be deleted separately from Firebase Console. Students assigned to them will need reassignment.`)) return;
    try {
      await deleteDoc(doc(db, 'users', teacherId));
      setTeachers((prev) => prev.filter((t) => t.id !== teacherId));
      toast.success(`${teacherName} removed`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete teacher');
    }
  }

  const filtered = teachers.filter((t) =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="spinner-overlay"><div className="spinner"></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>👨‍🏫 Manage Teachers</h1>
        <p>{teachers.length} teacher{teachers.length !== 1 ? 's' : ''} registered</p>
      </div>

      {/* Add Teacher Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          className={`btn ${showAddForm ? 'btn-secondary' : 'btn-primary'} btn-sm`}
          onClick={() => showAddForm ? resetForm() : setShowAddForm(true)}
          id="add-teacher-btn"
        >
          {showAddForm ? <><HiOutlineX /> Cancel</> : <><HiOutlinePlus /> Add Teacher</>}
        </button>
      </div>

      {/* Add Teacher Form */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Add New Teacher</h3>
          <form onSubmit={handleAddTeacher}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input type="text" className="form-input" placeholder="Teacher's name" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="tel" className="form-input" placeholder="Phone number" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Subject / Specialization</label>
              <input type="text" className="form-input" placeholder="e.g., Mathematics, Science" value={form.subject} onChange={(e) => updateField('subject', e.target.value)} />
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
            <button type="submit" className="btn btn-primary" disabled={adding} id="add-teacher-submit">
              {adding ? 'Creating...' : <><HiOutlinePlus /> Create Teacher Account</>}
            </button>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="search-bar" style={{ marginBottom: 16 }}>
        <HiOutlineSearch className="search-icon" />
        <input
          type="text"
          placeholder="Search teachers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          id="teachers-search"
        />
      </div>

      {/* Teacher List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👨‍🏫</div>
          <h3>{search ? 'No Teachers Found' : 'No Teachers Yet'}</h3>
          <p>{search ? 'Try a different search.' : 'Add your first teacher to get started.'}</p>
        </div>
      ) : (
        <div className="stagger-list">
          {filtered.map((teacher) => {
            const isEditing = editTeacherId === teacher.id;
            return (
              <div key={teacher.id} className="card" style={{ marginBottom: 10 }}>
                {/* Summary Row */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onClick={() => {
                    if (!isEditing) {
                      setExpandedTeacher(expandedTeacher === teacher.id ? null : teacher.id);
                    }
                  }}
                >
                  <div className="avatar">
                    {getInitials(isEditing ? editForm.name : teacher.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontSize: '0.9375rem', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isEditing ? editForm.name : teacher.name}
                    </h4>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {teacher.email}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="badge badge-info" style={{ fontSize: '0.6875rem' }}>
                      {teacher.studentCount} student{teacher.studentCount !== 1 ? 's' : ''}
                    </span>
                    {(isEditing ? editForm.subject : teacher.subject) && (
                      <p style={{ fontSize: '0.6875rem', color: 'var(--gray-400)', marginTop: 2 }}>
                        {isEditing ? editForm.subject : teacher.subject}
                      </p>
                    )}
                  </div>
                </div>

                {/* Expanded Details / Edit Form */}
                {expandedTeacher === teacher.id && (
                  <div style={{
                    marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--gray-100)',
                    animation: 'fadeInUp 0.2s ease-out',
                  }}>
                    {isEditing ? (
                      /* Edit Mode */
                      <>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Full Name *</label>
                            <input type="text" className="form-input" value={editForm.name}
                              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input type="tel" className="form-input" value={editForm.phone}
                              onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Subject / Specialization</label>
                          <input type="text" className="form-input" value={editForm.subject}
                            onChange={(e) => setEditForm((p) => ({ ...p, subject: e.target.value }))} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                          <button className="btn btn-secondary btn-sm" onClick={cancelEdit} disabled={saving}>
                            <HiOutlineX /> Cancel
                          </button>
                          <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving}>
                            <HiOutlineCheck /> {saving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </>
                    ) : (
                      /* View Mode */
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: '0.8125rem' }}>
                          <DetailField label="Phone" value={teacher.phone} />
                          <DetailField label="Subject" value={teacher.subject} />
                          <DetailField label="Email" value={teacher.email} />
                          <DetailField label="Students" value={teacher.studentCount} />
                        </div>
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={(e) => { e.stopPropagation(); startEdit(teacher); }}
                          >
                            <HiOutlinePencil /> Edit
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ color: 'var(--danger)', background: 'var(--danger-light)', border: 'none' }}
                            onClick={(e) => { e.stopPropagation(); handleDelete(teacher.id, teacher.name); }}
                          >
                            <HiOutlineTrash /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
