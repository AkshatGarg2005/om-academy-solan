import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Layout — always rendered, so kept in the main bundle
import Navbar from './components/Layout/Navbar';
import Sidebar from './components/Layout/Sidebar';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';

// Auth — Login is the first thing a signed-out visitor sees
import Login from './components/Auth/Login';

// Everything below is split into its own chunk and fetched on first visit, so
// a student never downloads the admin screens (and vice versa).
const Register = lazy(() => import('./components/Auth/Register'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const Profile = lazy(() => import('./components/Profile/Profile'));
const TestReportList = lazy(() => import('./components/TestReport/TestReportList'));
const TestReportForm = lazy(() => import('./components/TestReport/TestReportForm'));
const AttendanceView = lazy(() => import('./components/Attendance/AttendanceView'));
const AttendanceForm = lazy(() => import('./components/Attendance/AttendanceForm'));
const CourseView = lazy(() => import('./components/Course/CourseView'));
const CourseForm = lazy(() => import('./components/Course/CourseForm'));
const FeeView = lazy(() => import('./components/Fee/FeeView'));
const FeeForm = lazy(() => import('./components/Fee/FeeForm'));
const BatchManage = lazy(() => import('./components/Batch/BatchManage'));
const AllStudents = lazy(() => import('./components/Teacher/AllStudents'));
const ManageTeachers = lazy(() => import('./components/Admin/ManageTeachers'));
const AssignStudents = lazy(() => import('./components/Admin/AssignStudents'));

function PageSpinner() {
  return (
    <div className="spinner-overlay">
      <div className="spinner"></div>
    </div>
  );
}

function AppLayout() {
  const { currentUser, userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="spinner-overlay" style={{ minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // Not logged in — show auth pages only
  if (!currentUser || !userProfile) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageSpinner />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Logged in — show app with navigation
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <ErrorBoundary>
        <Suspense fallback={<PageSpinner />}>
        <Routes>
          {/* Dashboard */}
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />

          {/* Student pages */}
          <Route path="/profile" element={
            <ProtectedRoute><Profile /></ProtectedRoute>
          } />
          <Route path="/tests" element={
            <ProtectedRoute><TestReportList /></ProtectedRoute>
          } />
          <Route path="/attendance" element={
            <ProtectedRoute><AttendanceView /></ProtectedRoute>
          } />
          <Route path="/courses" element={
            <ProtectedRoute><CourseView /></ProtectedRoute>
          } />
          <Route path="/fees" element={
            <ProtectedRoute><FeeView /></ProtectedRoute>
          } />

          {/* Staff pages (teacher + admin) */}
          <Route path="/students" element={
            <ProtectedRoute staffOnly><AllStudents /></ProtectedRoute>
          } />
          <Route path="/tests/add" element={
            <ProtectedRoute staffOnly><TestReportForm /></ProtectedRoute>
          } />
          <Route path="/attendance/mark" element={
            <ProtectedRoute staffOnly><AttendanceForm /></ProtectedRoute>
          } />
          <Route path="/courses/manage" element={
            <ProtectedRoute staffOnly><CourseForm /></ProtectedRoute>
          } />
          <Route path="/fees/manage" element={
            <ProtectedRoute staffOnly><FeeForm /></ProtectedRoute>
          } />
          <Route path="/batches" element={
            <ProtectedRoute staffOnly><BatchManage /></ProtectedRoute>
          } />

          {/* Admin-only pages */}
          <Route path="/admin/teachers" element={
            <ProtectedRoute adminOnly><ManageTeachers /></ProtectedRoute>
          } />
          <Route path="/admin/assign" element={
            <ProtectedRoute adminOnly><AssignStudents /></ProtectedRoute>
          } />

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="/register" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>
      <Navbar />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '12px',
              background: '#1f2937',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 500,
              padding: '12px 20px',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#fff' },
            },
          }}
        />
        <AppLayout />
      </AuthProvider>
    </Router>
  );
}
