import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { todayLocalISO } from '../../utils/helpers';
import {
  HiOutlineMail, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff,
  HiOutlineUser, HiOutlineArrowLeft, HiOutlineArrowRight,
  HiOutlinePhone, HiOutlineLocationMarker,
} from 'react-icons/hi';
import './Auth.css';

const INITIAL_FORM = {
  name: '',
  studentPhone: '',
  email: '',
  password: '',
  confirmPassword: '',
  aadhaar: '',
  dob: '',
  address: '',
  previousEducation: '',
  mothersName: '',
  fathersName: '',
  guardianName: '',
  guardianPhone: '',
};

export default function Register() {
  const [step, setStep] = useState(1);
  // dateOfAdmission is seeded here rather than in INITIAL_FORM: a module-level
  // constant is evaluated once at import and would go stale past midnight.
  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    dateOfAdmission: todayLocalISO(),
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validateStep1() {
    if (!form.name.trim()) return 'Student name is required';
    if (!form.email.trim()) return 'Email is required';
    if (!form.password) return 'Password is required';
    if (form.password.length < 6) return 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    return null;
  }

  function validateStep2() {
    if (!form.dob) return 'Date of birth is required';
    if (!form.guardianPhone.trim()) return 'Guardian phone number is required';
    return null;
  }

  function nextStep() {
    if (step === 1) {
      const err = validateStep1();
      if (err) { toast.error(err); return; }
    }
    setStep((s) => s + 1);
  }

  function prevStep() {
    setStep((s) => s - 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validateStep2();
    if (err) { toast.error(err); return; }

    setLoading(true);
    try {
      const profileData = {
        name: form.name.trim(),
        studentPhone: form.studentPhone.trim(),
        aadhaar: form.aadhaar.trim(),
        dob: form.dob,
        address: form.address.trim(),
        previousEducation: form.previousEducation.trim(),
        mothersName: form.mothersName.trim(),
        fathersName: form.fathersName.trim(),
        guardianName: form.guardianName.trim(),
        guardianPhone: form.guardianPhone.trim(),
        dateOfAdmission: form.dateOfAdmission,
        batchIds: [],
        courseIds: [],
      };

      await register(form.email, form.password, profileData);
      toast.success('Registration successful! Welcome to Om Academy.');
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        toast.error('An account with this email already exists');
        setStep(1);
      } else {
        toast.error(err.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container auth-container-register">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo">
            <span>OA</span>
          </div>
          <h1>Join Om Academy</h1>
          <p>Create your student account</p>
        </div>

        {/* Step Indicator */}
        <div className="step-indicator">
          {[1, 2].map((s) => (
            <div key={s} className={`step-dot ${step >= s ? 'active' : ''} ${step === s ? 'current' : ''}`}>
              {s}
            </div>
          ))}
          <div className="step-line">
            <div className="step-line-fill" style={{ width: `${((step - 1) / 1) * 100}%` }}></div>
          </div>
        </div>
        <div className="step-labels">
          <span className={step === 1 ? 'active' : ''}>Account</span>
          <span className={step === 2 ? 'active' : ''}>Personal</span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form" id="register-form">
          {/* Step 1: Account Details */}
          {step === 1 && (
            <div className="form-step" key="step1">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <div className="input-icon-wrapper">
                  <HiOutlineUser className="input-icon" />
                  <input
                    type="text"
                    className="form-input input-with-icon"
                    placeholder="Enter student's full name"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    id="reg-name"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Student Phone Number</label>
                <div className="input-icon-wrapper">
                  <HiOutlinePhone className="input-icon" />
                  <input
                    type="tel"
                    className="form-input input-with-icon"
                    placeholder="Student's phone number"
                    value={form.studentPhone}
                    onChange={(e) => updateField('studentPhone', e.target.value)}
                    id="reg-student-phone"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <div className="input-icon-wrapper">
                  <HiOutlineMail className="input-icon" />
                  <input
                    type="email"
                    className="form-input input-with-icon"
                    placeholder="Enter email address"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    id="reg-email"
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Password *</label>
                <div className="input-icon-wrapper">
                  <HiOutlineLockClosed className="input-icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input input-with-icon"
                    placeholder="Create a password (min 6 chars)"
                    value={form.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    id="reg-password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="input-icon-right"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <HiOutlineEyeOff /> : <HiOutlineEye />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password *</label>
                <div className="input-icon-wrapper">
                  <HiOutlineLockClosed className="input-icon" />
                  <input
                    type="password"
                    className="form-input input-with-icon"
                    placeholder="Confirm your password"
                    value={form.confirmPassword}
                    onChange={(e) => updateField('confirmPassword', e.target.value)}
                    id="reg-confirm-password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Personal Details */}
          {step === 2 && (
            <div className="form-step" key="step2">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date of Birth *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.dob}
                    onChange={(e) => updateField('dob', e.target.value)}
                    id="reg-dob"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Aadhaar Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="XXXX XXXX XXXX"
                    value={form.aadhaar}
                    maxLength={14}
                    onChange={(e) => updateField('aadhaar', e.target.value)}
                    id="reg-aadhaar"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <div className="input-icon-wrapper">
                  <HiOutlineLocationMarker className="input-icon" style={{ top: '16px', transform: 'none' }} />
                  <textarea
                    className="form-input input-with-icon"
                    placeholder="Enter full address"
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    rows={2}
                    id="reg-address"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Previous Education</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., 10th Pass, 12th Science"
                  value={form.previousEducation}
                  onChange={(e) => updateField('previousEducation', e.target.value)}
                  id="reg-education"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Mother's Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Mother's name"
                    value={form.mothersName}
                    onChange={(e) => updateField('mothersName', e.target.value)}
                    id="reg-mother"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Father's Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Father's name"
                    value={form.fathersName}
                    onChange={(e) => updateField('fathersName', e.target.value)}
                    id="reg-father"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Guardian Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Guardian's name"
                    value={form.guardianName}
                    onChange={(e) => updateField('guardianName', e.target.value)}
                    id="reg-guardian"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Guardian Phone *</label>
                  <div className="input-icon-wrapper">
                    <HiOutlinePhone className="input-icon" />
                    <input
                      type="tel"
                      className="form-input input-with-icon"
                      placeholder="10-digit phone"
                      value={form.guardianPhone}
                      onChange={(e) => updateField('guardianPhone', e.target.value)}
                      id="reg-guardian-phone"
                    />
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Date of Admission</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.dateOfAdmission}
                  onChange={(e) => updateField('dateOfAdmission', e.target.value)}
                  id="reg-admission-date"
                />
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="form-nav">
            {step > 1 && (
              <button type="button" className="btn btn-secondary" onClick={prevStep} id="reg-prev">
                <HiOutlineArrowLeft /> Back
              </button>
            )}
            {step < 2 ? (
              <button type="button" className="btn btn-primary" onClick={nextStep} style={{ marginLeft: 'auto' }} id="reg-next">
                Next <HiOutlineArrowRight />
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ marginLeft: 'auto' }}
                id="reg-submit"
              >
                {loading ? (
                  <span className="btn-loading">
                    <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }}></span>
                    Registering...
                  </span>
                ) : (
                  'Complete Registration'
                )}
              </button>
            )}
          </div>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" id="go-to-login">Sign in</Link>
          </p>
        </div>
      </div>

      <div className="auth-decoration">
        <div className="auth-circle auth-circle-1"></div>
        <div className="auth-circle auth-circle-2"></div>
        <div className="auth-circle auth-circle-3"></div>
      </div>
    </div>
  );
}
