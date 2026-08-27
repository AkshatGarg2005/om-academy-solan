import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { loadStudents, loadTeachers, invalidateStudents } from '../../utils/firestore';
import { getInitials } from '../../utils/helpers';
import toast from 'react-hot-toast';
import {
  HiOutlineSearch, HiOutlineUserAdd, HiOutlineX,
} from 'react-icons/hi';

export default function AssignStudents() {
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('');
  const [saving, setSaving] = useState(null); // studentId currently being saved

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [studentList, teacherList] = await Promise.all([
        loadStudents(true, null),
        loadTeachers(),
      ]);
      setStudents(studentList);
      setTeachers(teacherList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function getTeacherNames(teacherIds) {
    if (!teacherIds || teacherIds.length === 0) return null;
    return teacherIds
      .map((id) => teachers.find((t) => t.id === id))
      .filter(Boolean)
      .map((t) => t.name);
  }

  async function toggleTeacher(studentId, teacherId) {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    const currentIds = student.teacherIds || [];
    const isAssigned = currentIds.includes(teacherId);
    const newIds = isAssigned
      ? currentIds.filter((id) => id !== teacherId)
      : [...currentIds, teacherId];

    setSaving(studentId);
    try {
      await updateDoc(doc(db, 'users', studentId), { teacherIds: newIds });
      setStudents((prev) =>
        prev.map((s) => s.id === studentId ? { ...s, teacherIds: newIds } : s)
      );
      // Reassignment changes which roster each teacher sees.
      invalidateStudents();
      const teacher = teachers.find((t) => t.id === teacherId);
      toast.success(
        isAssigned
          ? `${teacher?.name} removed from ${student.name}`
          : `${teacher?.name} assigned to ${student.name}`
      );
    } catch (err) {
      console.error(err);
      toast.error('Failed to update assignment');
    } finally {
      setSaving(null);
    }
  }

  const filtered = students.filter((s) => {
    const matchSearch = !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase());
    const matchTeacher = !filterTeacher
      ? true
      : filterTeacher === 'unassigned'
        ? !(s.teacherIds?.length > 0)
        : (s.teacherIds || []).includes(filterTeacher);
    return matchSearch && matchTeacher;
  });

  if (loading) {
    return <div className="spinner-overlay"><div className="spinner"></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>🔗 Assign Students</h1>
        <p>Assign teachers to students</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
          <HiOutlineSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="assign-search"
          />
        </div>
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: 140, padding: '10px 14px' }}
          value={filterTeacher}
          onChange={(e) => setFilterTeacher(e.target.value)}
          id="assign-filter"
        >
          <option value="">All Students</option>
          <option value="unassigned">⚠️ Unassigned</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Summary */}
      {teachers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👨‍🏫</div>
          <h3>No Teachers Yet</h3>
          <p>Add teachers first before assigning students.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3>No Students Found</h3>
          <p>Try adjusting your search or filter.</p>
        </div>
      ) : (
        <div className="stagger-list">
          {filtered.map((student) => {
            const assignedNames = getTeacherNames(student.teacherIds);
            const isUnassigned = !assignedNames || assignedNames.length === 0;

            return (
              <div key={student.id} className="card" style={{ marginBottom: 10 }}>
                {/* Student info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div className="avatar" style={{ flexShrink: 0 }}>
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
                  {isUnassigned && (
                    <span className="badge badge-danger" style={{ fontSize: '0.625rem', flexShrink: 0 }}>
                      Unassigned
                    </span>
                  )}
                </div>

                {/* Teacher assignment chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {teachers.map((teacher) => {
                    const isAssigned = (student.teacherIds || []).includes(teacher.id);
                    const isSaving = saving === student.id;
                    return (
                      <button
                        key={teacher.id}
                        type="button"
                        disabled={isSaving}
                        onClick={() => toggleTeacher(student.id, teacher.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', borderRadius: 20,
                          fontSize: '0.75rem', fontWeight: 600,
                          border: `1.5px solid ${isAssigned ? 'var(--green-500)' : 'var(--gray-200)'}`,
                          background: isAssigned ? 'var(--green-50)' : 'var(--white)',
                          color: isAssigned ? 'var(--green-700)' : 'var(--gray-500)',
                          cursor: isSaving ? 'wait' : 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isAssigned ? <HiOutlineX style={{ fontSize: '0.7rem' }} /> : <HiOutlineUserAdd style={{ fontSize: '0.7rem' }} />}
                        {teacher.name}
                      </button>
                    );
                  })}
                </div>

                {/* Currently assigned info */}
                {assignedNames && assignedNames.length > 0 && (
                  <p style={{ fontSize: '0.6875rem', color: 'var(--gray-400)', marginTop: 8 }}>
                    Assigned to: {assignedNames.join(', ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
