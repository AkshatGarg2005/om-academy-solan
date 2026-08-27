import React, { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { loadStudents, loadCourses, invalidate, invalidateStudents, cacheKeys } from '../../utils/firestore';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineUserAdd, HiOutlinePencil, HiOutlineCheck, HiOutlineX, HiOutlineSearch } from 'react-icons/hi';

export default function CourseForm() {
  const { currentUser, isAdmin } = useAuth();
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [showEnroll, setShowEnroll] = useState(null);
  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [editCourse, setEditCourse] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [courseList, studentList] = await Promise.all([
        loadCourses(),
        loadStudents(isAdmin, currentUser.uid),
      ]);
      setCourses(courseList);
      setStudents(studentList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Course name required'); return; }
    try {
      const course = { name: name.trim(), description: description.trim() };
      const ref = await addDoc(collection(db, 'courses'), {
        ...course,
        createdAt: serverTimestamp(),
      });
      // Append locally rather than refetching every course and student.
      setCourses((prev) => [...prev, { id: ref.id, ...course }]);
      invalidate(cacheKeys.courses);
      toast.success('Course added!');
      setName('');
      setDescription('');
    } catch (err) {
      toast.error('Failed to add course');
    }
  }

  async function handleDelete(courseId) {
    if (!window.confirm('Delete this course?')) return;
    try {
      // Remove courseId from all students
      const studentsWithCourse = students.filter((s) => (s.courseIds || []).includes(courseId));
      await Promise.all([
        ...studentsWithCourse.map((s) =>
          updateDoc(doc(db, 'users', s.id), { courseIds: arrayRemove(courseId) })
        ),
        deleteDoc(doc(db, 'courses', courseId)),
      ]);
      // Mirror the change locally rather than refetching everything.
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
      setStudents((prev) =>
        prev.map((s) =>
          (s.courseIds || []).includes(courseId)
            ? { ...s, courseIds: s.courseIds.filter((id) => id !== courseId) }
            : s
        )
      );
      invalidate(cacheKeys.courses);
      invalidateStudents();
      toast.success('Course deleted');
    } catch (err) {
      toast.error('Failed to delete');
    }
  }

  function startEdit(course) {
    setEditCourse(course.id);
    setEditName(course.name || '');
    setEditDesc(course.description || '');
  }

  function cancelEdit() {
    setEditCourse(null);
    setEditName('');
    setEditDesc('');
  }

  async function saveEdit(courseId) {
    if (!editName.trim()) { toast.error('Course name required'); return; }
    setSaving(true);
    try {
      const updated = { name: editName.trim(), description: editDesc.trim() };
      await updateDoc(doc(db, 'courses', courseId), updated);
      setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, ...updated } : c)));
      invalidate(cacheKeys.courses);
      toast.success('Course updated!');
      setEditCourse(null);
    } catch (err) {
      toast.error('Failed to update course');
    } finally {
      setSaving(false);
    }
  }

  async function handleEnroll(courseId) {
    if (!enrollStudentId) { toast.error('Select a student'); return; }
    try {
      await updateDoc(doc(db, 'users', enrollStudentId), {
        courseIds: arrayUnion(courseId),
      });
      setStudents((prev) =>
        prev.map((s) =>
          s.id === enrollStudentId && !(s.courseIds || []).includes(courseId)
            ? { ...s, courseIds: [...(s.courseIds || []), courseId] }
            : s
        )
      );
      invalidateStudents();
      toast.success('Student enrolled!');
      setShowEnroll(null);
      setEnrollStudentId('');
    } catch (err) {
      toast.error('Failed to enroll');
    }
  }

  async function handleUnenroll(courseId, studentId) {
    try {
      await updateDoc(doc(db, 'users', studentId), {
        courseIds: arrayRemove(courseId),
      });
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? { ...s, courseIds: (s.courseIds || []).filter((id) => id !== courseId) }
            : s
        )
      );
      invalidateStudents();
      toast.success('Student removed from course');
    } catch (err) {
      toast.error('Failed to unenroll');
    }
  }

  if (loading) {
    return <div className="spinner-overlay"><div className="spinner"></div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>🎓 Manage Courses</h1>
        <p>Create courses and enroll students</p>
      </div>

      {/* Add Form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Add New Course</h3>
        <form onSubmit={handleAdd}>
          <div className="form-group">
            <label className="form-label">Course Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., JEE Preparation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              id="course-name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              placeholder="Brief description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              id="course-desc"
            />
          </div>
          <button type="submit" className="btn btn-primary" id="course-submit">
            <HiOutlinePlus /> Add Course
          </button>
        </form>
      </div>

      {/* Course List */}
      {courses.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>No courses yet. Create one above.</p>
        </div>
      ) : (
        <div className="stagger-list">
          {courses.map((course) => {
            const enrolled = students.filter((s) => (s.courseIds || []).includes(course.id));
            return (
              <div className="card" key={course.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  {editCourse === course.id ? (
                    <div style={{ flex: 1, marginRight: 8 }}>
                      <input
                        type="text" className="form-input" value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Course name" style={{ marginBottom: 6, padding: '6px 10px', fontSize: '0.875rem' }}
                      />
                      <textarea
                        className="form-input" value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Description" rows={2} style={{ padding: '6px 10px', fontSize: '0.875rem' }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveEdit(course.id)}>
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
                        <h4>{course.name}</h4>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>{course.description || '—'}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon btn-sm" style={{ color: 'var(--info)' }} onClick={() => startEdit(course)} title="Edit course">
                          <HiOutlinePencil />
                        </button>
                        <button className="btn-icon btn-sm" style={{ color: 'var(--green-600)' }} onClick={() => setShowEnroll(showEnroll === course.id ? null : course.id)} title="Enroll student">
                          <HiOutlineUserAdd />
                        </button>
                        {/* Admin only: a teacher can only see their own students,
                            so their cleanup would leave every other teacher's
                            students pointing at a deleted course. */}
                        {isAdmin && (
                          <button className="btn-icon btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(course.id)} title="Delete">
                            <HiOutlineTrash />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Enrolled students */}
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 6 }}>
                  Enrolled ({enrolled.length})
                </div>
                {enrolled.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {enrolled.map((s) => (
                      <span key={s.id} className="badge badge-success" style={{ cursor: 'pointer' }} onClick={() => handleUnenroll(course.id, s.id)} title="Click to remove">
                        {s.name} ✕
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--gray-400)' }}>No students enrolled</p>
                )}

                {/* Enroll form */}
                {showEnroll === course.id && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <HiOutlineSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', fontSize: '0.875rem' }} />
                      <input
                        type="text" placeholder="Search student..."
                        value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)}
                        style={{
                          width: '100%', padding: '8px 10px 8px 32px', fontSize: '0.8125rem',
                          border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)',
                          background: 'var(--white)', outline: 'none',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select className="form-input" style={{ flex: 1, padding: '8px 12px', fontSize: '0.875rem' }} value={enrollStudentId} onChange={(e) => setEnrollStudentId(e.target.value)}>
                        <option value="">Select student</option>
                        {students
                          .filter((s) => !(s.courseIds || []).includes(course.id))
                          .filter((s) => !courseSearch || s.name?.toLowerCase().includes(courseSearch.toLowerCase()) || s.email?.toLowerCase().includes(courseSearch.toLowerCase()))
                          .map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                      </select>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => handleEnroll(course.id)}>
                        Enroll
                      </button>
                    </div>
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
