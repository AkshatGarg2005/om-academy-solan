import React, { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { loadStudents, loadBatches, invalidate, invalidateStudents, cacheKeys } from '../../utils/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { getInitials } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineUserAdd, HiOutlineX, HiOutlineCheck, HiOutlinePencil, HiOutlineSearch } from 'react-icons/hi';

export default function BatchManage() {
  const { currentUser, isAdmin } = useAuth();
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [name, setName] = useState('');
  const [timing, setTiming] = useState('');
  const [loading, setLoading] = useState(true);
  const [manageBatch, setManageBatch] = useState(null);
  const [selectedToAdd, setSelectedToAdd] = useState({});
  const [selectedToRemove, setSelectedToRemove] = useState({});
  const [saving, setSaving] = useState(false);
  const [editBatch, setEditBatch] = useState(null);
  const [editName, setEditName] = useState('');
  const [editTiming, setEditTiming] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [batchList, studentList] = await Promise.all([
        loadBatches(),
        loadStudents(isAdmin, currentUser.uid),
      ]);
      setBatches(batchList);
      setStudents(studentList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Batch name required'); return; }
    try {
      const batch = { name: name.trim(), timing: timing.trim() };
      const ref = await addDoc(collection(db, 'batches'), {
        ...batch,
        createdAt: serverTimestamp(),
      });
      // Append locally rather than refetching every batch and student.
      setBatches((prev) => [...prev, { id: ref.id, ...batch }]);
      invalidate(cacheKeys.batches);
      toast.success('Batch created!');
      setName('');
      setTiming('');
    } catch (err) {
      toast.error('Failed to create batch');
    }
  }

  async function handleDelete(batchId) {
    if (!window.confirm('Delete this batch?')) return;
    try {
      const batchStudents = students.filter((s) => (s.batchIds || []).includes(batchId));
      const ops = batchStudents.map((s) =>
        updateDoc(doc(db, 'users', s.id), { batchIds: arrayRemove(batchId) })
      );
      ops.push(deleteDoc(doc(db, 'batches', batchId)));
      await Promise.all(ops);
      // Mirror the change locally rather than refetching everything.
      setBatches((prev) => prev.filter((b) => b.id !== batchId));
      setStudents((prev) =>
        prev.map((s) =>
          (s.batchIds || []).includes(batchId)
            ? { ...s, batchIds: s.batchIds.filter((id) => id !== batchId) }
            : s
        )
      );
      invalidate(cacheKeys.batches);
      invalidateStudents();
      toast.success('Batch deleted');
      if (manageBatch === batchId) setManageBatch(null);
    } catch (err) {
      toast.error('Failed to delete');
    }
  }

  function startEdit(batch) {
    setEditBatch(batch.id);
    setEditName(batch.name || '');
    setEditTiming(batch.timing || '');
  }

  function cancelEdit() {
    setEditBatch(null);
    setEditName('');
    setEditTiming('');
  }

  async function saveEdit(batchId) {
    if (!editName.trim()) { toast.error('Batch name required'); return; }
    setSaving(true);
    try {
      const updated = { name: editName.trim(), timing: editTiming.trim() };
      await updateDoc(doc(db, 'batches', batchId), updated);
      setBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, ...updated } : b)));
      invalidate(cacheKeys.batches);
      toast.success('Batch updated!');
      setEditBatch(null);
    } catch (err) {
      toast.error('Failed to update batch');
    } finally {
      setSaving(false);
    }
  }

  function openManage(batchId) {
    if (manageBatch === batchId) {
      setManageBatch(null);
      return;
    }
    setManageBatch(batchId);
    setSelectedToAdd({});
    setSelectedToRemove({});
    setSearchQuery('');
  }

  function toggleAdd(studentId) {
    setSelectedToAdd((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  function toggleRemove(studentId) {
    setSelectedToRemove((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  async function handleAddMultiple(batchId) {
    const ids = Object.entries(selectedToAdd).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) { toast.error('Select at least one student'); return; }
    setSaving(true);
    try {
      await Promise.all(
        ids.map((sid) => updateDoc(doc(db, 'users', sid), { batchIds: arrayUnion(batchId) }))
      );
      setStudents((prev) =>
        prev.map((s) =>
          ids.includes(s.id) && !(s.batchIds || []).includes(batchId)
            ? { ...s, batchIds: [...(s.batchIds || []), batchId] }
            : s
        )
      );
      invalidateStudents();
      toast.success(`${ids.length} student${ids.length > 1 ? 's' : ''} added to batch!`);
      setSelectedToAdd({});
    } catch (err) {
      toast.error('Failed to add students');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMultiple(batchId) {
    const ids = Object.entries(selectedToRemove).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) { toast.error('Select at least one student'); return; }
    if (!window.confirm(`Remove ${ids.length} student${ids.length > 1 ? 's' : ''} from this batch?`)) return;
    setSaving(true);
    try {
      await Promise.all(
        ids.map((sid) => updateDoc(doc(db, 'users', sid), { batchIds: arrayRemove(batchId) }))
      );
      setStudents((prev) =>
        prev.map((s) =>
          ids.includes(s.id)
            ? { ...s, batchIds: (s.batchIds || []).filter((id) => id !== batchId) }
            : s
        )
      );
      invalidateStudents();
      toast.success(`${ids.length} student${ids.length > 1 ? 's' : ''} removed!`);
      setSelectedToRemove({});
    } catch (err) {
      toast.error('Failed to remove students');
    } finally {
      setSaving(false);
    }
  }

  function selectAllToAdd(unassigned) {
    const allSelected = unassigned.every((s) => selectedToAdd[s.id]);
    const next = {};
    unassigned.forEach((s) => { next[s.id] = !allSelected; });
    setSelectedToAdd(next);
  }

  function selectAllToRemove(assigned) {
    const allSelected = assigned.every((s) => selectedToRemove[s.id]);
    const next = {};
    assigned.forEach((s) => { next[s.id] = !allSelected; });
    setSelectedToRemove(next);
  }

  if (loading) {
    return <div className="spinner-overlay"><div className="spinner"></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>📦 Manage Batches</h1>
        <p>Create batches and assign students</p>
      </div>

      {/* Add Form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Create New Batch</h3>
        <form onSubmit={handleAdd}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Batch Name</label>
              <input type="text" className="form-input" placeholder="e.g., Morning Batch A" value={name} onChange={(e) => setName(e.target.value)} id="batch-name" />
            </div>
            <div className="form-group">
              <label className="form-label">Timing</label>
              <input type="text" className="form-input" placeholder="e.g., 8:00 AM - 10:00 AM" value={timing} onChange={(e) => setTiming(e.target.value)} id="batch-timing" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" id="batch-submit">
            <HiOutlinePlus /> Create Batch
          </button>
        </form>
      </div>

      {/* Batch List */}
      {batches.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>No batches created yet.</p>
        </div>
      ) : (
        <div className="stagger-list">
          {batches.map((batch) => {
            const assigned = students.filter((s) => (s.batchIds || []).includes(batch.id));
            const unassigned = students.filter((s) => !(s.batchIds || []).includes(batch.id));
            const isManaging = manageBatch === batch.id;
            const q = searchQuery.toLowerCase();
            const filteredAssigned = q ? assigned.filter((s) => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)) : assigned;
            const filteredUnassigned = q ? unassigned.filter((s) => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)) : unassigned;
            const addCount = Object.values(selectedToAdd).filter(Boolean).length;
            const removeCount = Object.values(selectedToRemove).filter(Boolean).length;

            return (
              <div className="card" key={batch.id} style={{ marginBottom: 12 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  {editBatch === batch.id ? (
                    <div style={{ flex: 1, marginRight: 8 }}>
                      <input
                        type="text" className="form-input" value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Batch name" style={{ marginBottom: 6, padding: '6px 10px', fontSize: '0.875rem' }}
                      />
                      <input
                        type="text" className="form-input" value={editTiming}
                        onChange={(e) => setEditTiming(e.target.value)}
                        placeholder="Timing" style={{ padding: '6px 10px', fontSize: '0.875rem' }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveEdit(batch.id)}>
                          <HiOutlineCheck /> {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                          <HiOutlineX /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <h4>{batch.name}</h4>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>{batch.timing || 'No timing set'}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon btn-sm" style={{ color: 'var(--info)' }} onClick={() => startEdit(batch)} title="Edit batch">
                          <HiOutlinePencil />
                        </button>
                        <button className={`btn-icon btn-sm`} style={{ color: isManaging ? 'var(--gray-500)' : 'var(--green-600)' }} onClick={() => openManage(batch.id)} title="Manage students">
                          {isManaging ? <HiOutlineX /> : <HiOutlineUserAdd />}
                        </button>
                        <button className="btn-icon btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(batch.id)} title="Delete batch">
                          <HiOutlineTrash />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Current students */}
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 6 }}>
                  Students ({assigned.length})
                </div>

                {!isManaging ? (
                  // Simple badge view
                  assigned.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {assigned.map((s) => (
                        <span key={s.id} className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--gray-400)' }}>No students assigned</p>
                  )
                ) : (
                  // Full management UI
                  <div style={{ marginTop: 4 }}>
                    {/* Search */}
                    <div style={{ position: 'relative', marginBottom: 12 }}>
                      <HiOutlineSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', fontSize: '0.875rem' }} />
                      <input
                        type="text" placeholder="Search students..."
                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%', padding: '8px 10px 8px 32px', fontSize: '0.8125rem',
                          border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                          background: 'var(--white)', outline: 'none',
                        }}
                      />
                    </div>

                    {/* Remove section */}
                    {filteredAssigned.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginBottom: 8,
                        }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            In this batch — select to remove
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
                            onClick={() => selectAllToRemove(filteredAssigned)}
                          >
                            {filteredAssigned.every((s) => selectedToRemove[s.id]) ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {filteredAssigned.map((s) => (
                            <div
                              key={s.id}
                              onClick={() => toggleRemove(s.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                cursor: 'pointer', transition: 'background 0.15s',
                                background: selectedToRemove[s.id] ? 'var(--danger-light)' : 'var(--gray-50)',
                                border: `1.5px solid ${selectedToRemove[s.id] ? 'var(--danger)' : 'transparent'}`,
                              }}
                            >
                              <input type="checkbox" checked={!!selectedToRemove[s.id]} onChange={() => toggleRemove(s.id)} onClick={(e) => e.stopPropagation()} />
                              <div className="avatar" style={{ width: 28, height: 28, fontSize: '0.625rem', flexShrink: 0 }}>
                                {getInitials(s.name)}
                              </div>
                              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{s.name}</span>
                            </div>
                          ))}
                        </div>
                        {removeCount > 0 && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={saving}
                            onClick={() => handleRemoveMultiple(batch.id)}
                            style={{ marginTop: 8, color: 'var(--white)', background: 'var(--danger)', border: 'none' }}
                          >
                            <HiOutlineTrash /> Remove {removeCount} Student{removeCount > 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Add section */}
                    {filteredUnassigned.length > 0 && (
                      <div>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          marginBottom: 8,
                        }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--green-700)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            Not in batch — select to add
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
                            onClick={() => selectAllToAdd(filteredUnassigned)}
                          >
                            {filteredUnassigned.every((s) => selectedToAdd[s.id]) ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {filteredUnassigned.map((s) => (
                            <div
                              key={s.id}
                              onClick={() => toggleAdd(s.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                cursor: 'pointer', transition: 'background 0.15s',
                                background: selectedToAdd[s.id] ? 'var(--green-50)' : 'var(--gray-50)',
                                border: `1.5px solid ${selectedToAdd[s.id] ? 'var(--green-500)' : 'transparent'}`,
                              }}
                            >
                              <input type="checkbox" checked={!!selectedToAdd[s.id]} onChange={() => toggleAdd(s.id)} onClick={(e) => e.stopPropagation()} />
                              <div className="avatar" style={{ width: 28, height: 28, fontSize: '0.625rem', flexShrink: 0 }}>
                                {getInitials(s.name)}
                              </div>
                              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{s.name}</span>
                            </div>
                          ))}
                        </div>
                        {addCount > 0 && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={saving}
                            onClick={() => handleAddMultiple(batch.id)}
                            style={{ marginTop: 8 }}
                          >
                            <HiOutlineCheck /> Add {addCount} Student{addCount > 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    )}

                    {unassigned.length === 0 && assigned.length === 0 && (
                      <p style={{ fontSize: '0.8125rem', color: 'var(--gray-400)' }}>No students registered yet.</p>
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
