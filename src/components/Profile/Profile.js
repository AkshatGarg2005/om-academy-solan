import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { getInitials } from '../../utils/helpers';
import toast from 'react-hot-toast';
import {
  HiOutlinePencil, HiOutlineCheck, HiOutlineX, HiOutlineLockClosed,
} from 'react-icons/hi';

export default function Profile() {
  const { userProfile, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  if (!userProfile) {
    return (
      <div className="spinner-overlay">
        <div className="spinner"></div>
      </div>
    );
  }

  function startEdit() {
    setForm({
      name: userProfile.name || '',
      studentPhone: userProfile.studentPhone || '',
      phone: userProfile.phone || '',
      aadhaar: userProfile.aadhaar || '',
      dob: userProfile.dob || '',
      address: userProfile.address || '',
      previousEducation: userProfile.previousEducation || '',
      mothersName: userProfile.mothersName || '',
      fathersName: userProfile.fathersName || '',
      guardianName: userProfile.guardianName || '',
      guardianPhone: userProfile.guardianPhone || '',
      subject: userProfile.subject || '',
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm({});
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.name?.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ ...form });
      toast.success('Profile updated!');
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (!currentPassword) { toast.error('Enter current password'); return; }
    if (!newPassword || newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }

    setChangingPassword(true);
    try {
      // Re-authenticate
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Update password
      await updatePassword(auth.currentUser, newPassword);

      toast.success('Password changed successfully!');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect');
      } else if (err.code === 'auth/weak-password') {
        toast.error('New password is too weak');
      } else {
        toast.error(err.message || 'Failed to change password');
      }
    } finally {
      setChangingPassword(false);
    }
  }

  const isStudent = userProfile.role === 'student';
  const isTeacher = userProfile.role === 'teacher';

  // Fields based on role
  const studentFields = [
    { key: 'name', label: 'Full Name', type: 'text' },
    { key: 'studentPhone', label: 'Student Phone', type: 'tel' },
    { key: 'dob', label: 'Date of Birth', type: 'date' },
    { key: 'aadhaar', label: 'Aadhaar Number', type: 'text' },
    { key: 'address', label: 'Address', type: 'textarea' },
    { key: 'previousEducation', label: 'Previous Education', type: 'text' },
    { key: 'mothersName', label: "Mother's Name", type: 'text' },
    { key: 'fathersName', label: "Father's Name", type: 'text' },
    { key: 'guardianName', label: 'Guardian Name', type: 'text' },
    { key: 'guardianPhone', label: 'Guardian Phone', type: 'tel' },
  ];

  const staffFields = [
    { key: 'name', label: 'Full Name', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'subject', label: 'Subject / Specialization', type: 'text' },
  ];

  const fields = isStudent ? studentFields : staffFields;

  const readOnlyFields = [
    { label: 'Email', value: userProfile.email },
    { label: 'Role', value: userProfile.role?.charAt(0).toUpperCase() + userProfile.role?.slice(1) },
    ...(isStudent ? [{ label: 'Date of Admission', value: userProfile.dateOfAdmission || '—' }] : []),
  ];

  const roleBadgeClass = userProfile.role === 'admin' ? 'badge-warning' : isTeacher ? 'badge-info' : 'badge-success';

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ textAlign: 'center', paddingBottom: 48 }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div className="avatar avatar-lg" style={{
            width: 88, height: 88, fontSize: '2rem', margin: '0 auto 12px',
            border: '3px solid rgba(255,255,255,0.3)',
          }}>
            {getInitials(userProfile.name)}
          </div>
        </div>
        <h1>{userProfile.name}</h1>
        <p>{userProfile.email}</p>
        <span className={`badge ${roleBadgeClass}`} style={{ marginTop: 8 }}>
          {userProfile.role?.charAt(0).toUpperCase() + userProfile.role?.slice(1)}
        </span>
      </div>

      {/* Edit / Save / Cancel buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        {!editing ? (
          <button className="btn btn-secondary btn-sm" onClick={startEdit} id="profile-edit">
            <HiOutlinePencil /> Edit Profile
          </button>
        ) : (
          <>
            <button className="btn btn-secondary btn-sm" onClick={cancelEdit} disabled={saving}>
              <HiOutlineX /> Cancel
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} id="profile-save">
              <HiOutlineCheck /> {saving ? 'Saving...' : 'Save'}
            </button>
          </>
        )}
      </div>

      {/* Editable Fields */}
      <div className="stagger-list">
        {fields.map((field) => (
          <div className="list-card" key={field.key}>
            <div className="list-card-content" style={{ width: '100%' }}>
              <p style={{
                fontSize: '0.75rem', textTransform: 'uppercase',
                letterSpacing: '0.5px', fontWeight: 600,
                color: 'var(--gray-400)', marginBottom: 4,
              }}>
                {field.label}
              </p>
              {editing ? (
                field.type === 'textarea' ? (
                  <textarea
                    className="form-input"
                    value={form[field.key] || ''}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    rows={2}
                    style={{ fontSize: '0.9375rem', padding: '8px 12px' }}
                  />
                ) : (
                  <input
                    type={field.type}
                    className="form-input"
                    value={form[field.key] || ''}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    style={{ fontSize: '0.9375rem', padding: '8px 12px' }}
                  />
                )
              ) : (
                <h4 style={{ fontSize: '0.9375rem' }}>
                  {userProfile[field.key] || '—'}
                </h4>
              )}
            </div>
          </div>
        ))}

        {/* Read-only fields */}
        {readOnlyFields.map((field) => (
          <div className="list-card" key={field.label} style={{ opacity: editing ? 0.5 : 1 }}>
            <div className="list-card-content">
              <p style={{
                fontSize: '0.75rem', textTransform: 'uppercase',
                letterSpacing: '0.5px', fontWeight: 600,
                color: 'var(--gray-400)', marginBottom: 2,
              }}>
                {field.label} {editing && <span style={{ fontSize: '0.625rem', color: 'var(--gray-300)' }}>(read-only)</span>}
              </p>
              <h4 style={{ fontSize: '0.9375rem' }}>{field.value}</h4>
            </div>
          </div>
        ))}
      </div>

      {/* Change Password Section */}
      <div style={{ marginTop: 24 }}>
        <div className="section-title">
          <h2>Security</h2>
        </div>

        {!showPasswordForm ? (
          <button
            className="btn btn-secondary"
            onClick={() => setShowPasswordForm(true)}
            id="change-password-btn"
            style={{ width: '100%' }}
          >
            <HiOutlineLockClosed /> Change Password
          </button>
        ) : (
          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <HiOutlineLockClosed /> Change Password
            </h3>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  disabled={changingPassword}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={changingPassword} id="change-password-submit">
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
