# Om Academy — Coaching Institute Management System

A multi-role web platform that replaced paper registers at Om Academy, a coaching institute in Solan, Himachal Pradesh. Attendance, test reports, fees, courses and batches for **414 students** now run in one app, with separate dashboards for admins, teachers and students.

**Live:** [om-academy-solan-beta.vercel.app](https://om-academy-solan-beta.vercel.app) (sign-in required — it holds real student records)

## Impact

- Replaced paper-driven attendance, test-report, fee and enrollment workflows for 414 students
- Digitized **6,952+** attendance records
- Automated fee tracking with due-date alerts and overdue flags — **99.3%** on-time collection

## Features by role

**Students**
- Personal dashboard with attendance percentage, test reports, enrolled courses and batch schedule
- Fee alerts for upcoming and overdue payments

**Teachers**
- Mark daily attendance and log test results
- Manage assigned batches and view their student rosters

**Admins**
- Institute-wide view of attendance and pending fees
- Student and teacher directories, and role assignment for every user

## Architecture and security

- **Role-based access control:** three tiers (Admin → Teacher → Student) enforced with route guards (`adminOnly`, `staffOnly`)
- **Auth state:** handled in a React context driven by Firebase's `onAuthStateChanged`
- **Scoped real-time data:** Firestore queries are scoped per role, so teachers only read their assigned students and batches, and students only see their own records
- **Modular codebase:** 11 feature modules — Admin, Attendance, Auth, Batch, Course, Dashboard, Fee, Layout, Profile, Teacher and TestReport

## Tech stack

- **Frontend:** React 19, React Router 7, custom CSS (glassmorphism UI, mobile-first layout)
- **Backend:** Firebase Authentication, Cloud Firestore (with security rules)
- **UI libraries:** react-hot-toast, react-icons
- **Deployment:** Vercel

## Project structure

```
src/
├── components/
│   ├── Admin/        # Institute-wide analytics and role management
│   ├── Attendance/   # Daily attendance marking and tracking
│   ├── Auth/         # Sign-in and route guards
│   ├── Batch/        # Batch schedules and assignments
│   ├── Course/       # Courses and enrollment
│   ├── Dashboard/    # Role-specific dashboards
│   ├── Fee/          # Fee tracking and alerts
│   ├── Layout/       # App shell and navigation
│   ├── Profile/      # User profiles
│   ├── Teacher/      # Teacher tools and rosters
│   ├── TestReport/   # Test results and reports
│   └── common/       # Shared UI components
├── config/           # Firebase configuration
├── contexts/         # Auth context
└── utils/            # Helpers
```

## Running locally

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/AkshatGarg2005/om-academy-solan.git
   cd om-academy-solan
   yarn
   ```
2. Create a Firebase project with Email/Password authentication and Cloud Firestore enabled.
3. Copy `.env.example` to `.env` and fill in your Firebase config:
   ```
   REACT_APP_FIREBASE_API_KEY=
   REACT_APP_FIREBASE_AUTH_DOMAIN=
   REACT_APP_FIREBASE_PROJECT_ID=
   REACT_APP_FIREBASE_STORAGE_BUCKET=
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=
   REACT_APP_FIREBASE_APP_ID=
   ```
4. Start the dev server:
   ```bash
   yarn start
   ```

## Author

**Akshat Garg** — [Portfolio](https://akshatgarg2005.vercel.app) · [LinkedIn](https://www.linkedin.com/in/akshat-garg-vitbhopal/) · [GitHub](https://github.com/AkshatGarg2005)
