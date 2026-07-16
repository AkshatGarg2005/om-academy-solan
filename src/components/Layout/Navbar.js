import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  HiOutlineHome,
  HiOutlineDocumentText,
  HiOutlineCalendar,
  HiOutlineAcademicCap,
  HiOutlineCurrencyRupee,
  HiOutlineUsers,
  HiOutlineUserCircle,
  HiOutlineUserGroup,
} from 'react-icons/hi';
import './Navbar.css';

export default function Navbar() {
  const { isAdmin, isTeacher } = useAuth();
  const location = useLocation();

  const studentLinks = [
    { to: '/dashboard', icon: HiOutlineHome, label: 'Home' },
    { to: '/tests', icon: HiOutlineDocumentText, label: 'Tests' },
    { to: '/attendance', icon: HiOutlineCalendar, label: 'Attendance' },
    { to: '/fees', icon: HiOutlineCurrencyRupee, label: 'Fees' },
    { to: '/profile', icon: HiOutlineUserCircle, label: 'Profile' },
  ];

  const teacherLinks = [
    { to: '/dashboard', icon: HiOutlineHome, label: 'Home' },
    { to: '/students', icon: HiOutlineUsers, label: 'Students' },
    { to: '/attendance/mark', icon: HiOutlineCalendar, label: 'Attendance' },
    { to: '/tests/add', icon: HiOutlineDocumentText, label: 'Tests' },
    { to: '/courses/manage', icon: HiOutlineAcademicCap, label: 'Courses' },
  ];

  const adminLinks = [
    { to: '/dashboard', icon: HiOutlineHome, label: 'Home' },
    { to: '/admin/teachers', icon: HiOutlineUserGroup, label: 'Teachers' },
    { to: '/students', icon: HiOutlineUsers, label: 'Students' },
    { to: '/attendance/mark', icon: HiOutlineCalendar, label: 'Attendance' },
    { to: '/fees/manage', icon: HiOutlineCurrencyRupee, label: 'Fees' },
  ];

  const links = isAdmin ? adminLinks : isTeacher ? teacherLinks : studentLinks;

  return (
    <nav className="bottom-nav" id="bottom-nav">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = location.pathname === link.to;
        return (
          <NavLink
            key={link.to}
            to={link.to}
            className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            id={`nav-${link.label.toLowerCase()}`}
          >
            <Icon className="bottom-nav-icon" />
            <span className="bottom-nav-label">{link.label}</span>
            {isActive && <span className="bottom-nav-indicator" />}
          </NavLink>
        );
      })}
    </nav>
  );
}
