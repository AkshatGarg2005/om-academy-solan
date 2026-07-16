import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Layout
import Navbar from './components/Layout/Navbar';
import Sidebar from './components/Layout/Sidebar';
import ProtectedRoute from './components/Layout/ProtectedRoute';

// Auth
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';

// Pages
import Dashboard from './components/Dashboard/Dashboard';
import Profile from './components/Profile/Profile';
import TestReportList from './components/TestReport/TestReportList';
import TestReportForm from './components/TestReport/TestReportForm';
import AttendanceView from './components/Attendance/AttendanceView';
import AttendanceForm from './components/Attendance/AttendanceForm';
import CourseView from './components/Course/CourseView';
import CourseForm from './components/Course/CourseForm';
import FeeView from './components/Fee/FeeView';
import FeeForm from './components/Fee/FeeForm';
import BatchManage from './components/Batch/BatchManage';
import AllStudents from './components/Teacher/AllStudents';

// Admin Pages
import ManageTeachers from './components/Admin/ManageTeachers';
import AssignStudents from './components/Admin/AssignStudents';

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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Logged in — show app with navigation
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
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
