import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AttendanceForm from './AttendanceForm';
import { useAuth } from '../../contexts/AuthContext';
import { loadBatches, commitInChunks } from '../../utils/firestore';
import { getDocs } from 'firebase/firestore';

jest.mock('../../config/firebase', () => ({ db: {}, auth: {}, firebaseConfig: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), where: jest.fn(),
  doc: jest.fn(() => ({ path: 'attendance/generated' })),
  getDocs: jest.fn(), serverTimestamp: jest.fn(() => 'TS'),
}));
jest.mock('../../utils/firestore', () => ({
  loadBatches: jest.fn(), commitInChunks: jest.fn(),
}));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-hot-toast', () => ({
  __esModule: true, default: { success: jest.fn(), error: jest.fn() },
}));

const BATCHES = [{ id: 'b1', name: 'Morning', timing: '8-10' }];
// Three students share the batch; only Priya is assigned to teacher t1.
const IN_BATCH = [
  { id: 's1', name: 'Aarav Sharma', teacherIds: ['t2'], batchIds: ['b1'] },
  { id: 's2', name: 'Priya Verma', teacherIds: ['t1'], batchIds: ['b1'] },
  { id: 's3', name: 'Rohan Gupta', teacherIds: ['t2'], batchIds: ['b1'] },
];
const asSnap = (records) => ({
  empty: records.length === 0,
  size: records.length,
  docs: records.map(({ id, ...rest }) => ({ id, data: () => rest })),
});

function setup({ isAdmin, uid, attendanceRecords = [] }) {
  useAuth.mockReturnValue({ currentUser: { uid }, isAdmin });
  loadBatches.mockResolvedValue(BATCHES);
  commitInChunks.mockResolvedValue(undefined);
  getDocs
    .mockResolvedValueOnce(asSnap(IN_BATCH))            // loadBatchStudents
    .mockResolvedValue(asSnap(attendanceRecords));      // loadExistingAttendance
}

const chooseBatch = async () => {
  // Wait for the option itself: the <select> is rendered immediately, so waiting
  // on it races the batch list still loading.
  await screen.findByRole('option', { name: /Morning/ });
  await userEvent.selectOptions(document.getElementById('att-batch'), 'b1');
};
const summary = () => screen.getByText(/Present$/);

beforeEach(() => jest.clearAllMocks());

describe('AttendanceForm — roster scoping', () => {
  test('a teacher only sees their own assigned students in the batch', async () => {
    setup({ isAdmin: false, uid: 't1' });
    render(<AttendanceForm />);
    await chooseBatch();

    await waitFor(() => expect(screen.getByText('Priya Verma')).toBeInTheDocument());
    expect(screen.queryByText('Aarav Sharma')).not.toBeInTheDocument();
    expect(screen.queryByText('Rohan Gupta')).not.toBeInTheDocument();
  });

  test('the summary counts only the students on screen', async () => {
    // Every student in the batch was already marked present by another teacher,
    // so `attendance` holds 3 entries while only 1 student is listed.
    setup({
      isAdmin: false,
      uid: 't1',
      attendanceRecords: [
        { id: 'a1', studentId: 's1', present: true },
        { id: 'a2', studentId: 's2', present: true },
        { id: 'a3', studentId: 's3', present: true },
      ],
    });
    render(<AttendanceForm />);
    await chooseBatch();

    // Previously counted all 3 entries against 1 listed student: "3/1 Present".
    await waitFor(() => expect(summary()).toHaveTextContent('1/1 Present'));
    expect(screen.getByText('0 Absent')).toBeInTheDocument();
  });

  test('an admin sees everyone and the count matches', async () => {
    setup({ isAdmin: true, uid: 'admin1' });
    render(<AttendanceForm />);
    await chooseBatch();

    await waitFor(() => expect(screen.getByText('Aarav Sharma')).toBeInTheDocument());
    expect(summary()).toHaveTextContent('3/3 Present');
  });
});

describe('AttendanceForm — marking', () => {
  test('toggling a student updates the running count', async () => {
    setup({ isAdmin: true, uid: 'admin1' });
    render(<AttendanceForm />);
    await chooseBatch();
    await waitFor(() => expect(summary()).toHaveTextContent('3/3 Present'));

    await userEvent.click(screen.getByText('Priya Verma'));
    expect(summary()).toHaveTextContent('2/3 Present');
    expect(screen.getByText('1 Absent')).toBeInTheDocument();
  });

  test('a fresh register creates one record per student in a single batch', async () => {
    setup({ isAdmin: true, uid: 'admin1' });
    render(<AttendanceForm />);
    await chooseBatch();
    await waitFor(() => expect(summary()).toHaveTextContent('3/3 Present'));

    await userEvent.click(screen.getByText('Priya Verma')); // mark absent
    await userEvent.click(screen.getByRole('button', { name: /Save Attendance/ }));

    await waitFor(() => expect(commitInChunks).toHaveBeenCalledTimes(1));
    const batch = { set: jest.fn(), update: jest.fn() };
    commitInChunks.mock.calls[0][0].forEach((op) => op(batch));

    expect(batch.set).toHaveBeenCalledTimes(3);
    expect(batch.update).not.toHaveBeenCalled();
    const written = batch.set.mock.calls.map(([, data]) => data);
    expect(written.find((w) => w.studentId === 's2').present).toBe(false);
    expect(written.filter((w) => w.present)).toHaveLength(2);
    written.forEach((w) => expect(w.batchId).toBe('b1'));
  });

  test('an existing register updates rather than duplicating', async () => {
    setup({
      isAdmin: true,
      uid: 'admin1',
      attendanceRecords: [
        { id: 'a1', studentId: 's1', present: true },
        { id: 'a2', studentId: 's2', present: false },
        { id: 'a3', studentId: 's3', present: true },
      ],
    });
    render(<AttendanceForm />);
    await chooseBatch();

    await waitFor(() => expect(screen.getByText(/Attendance already exists/)).toBeInTheDocument());
    expect(summary()).toHaveTextContent('2/3 Present');

    await userEvent.click(screen.getByRole('button', { name: /Update Attendance/ }));
    await waitFor(() => expect(commitInChunks).toHaveBeenCalledTimes(1));

    const batch = { set: jest.fn(), update: jest.fn() };
    commitInChunks.mock.calls[0][0].forEach((op) => op(batch));
    expect(batch.update).toHaveBeenCalledTimes(3);
    expect(batch.set).not.toHaveBeenCalled();
  });

  test('a student added to the batch after marking defaults to present', async () => {
    // Only s1 and s2 have records; s3 joined the batch afterwards.
    setup({
      isAdmin: true,
      uid: 'admin1',
      attendanceRecords: [
        { id: 'a1', studentId: 's1', present: false },
        { id: 'a2', studentId: 's2', present: false },
      ],
    });
    render(<AttendanceForm />);
    await chooseBatch();

    await waitFor(() => expect(summary()).toHaveTextContent('1/3 Present'));
    await userEvent.click(screen.getByRole('button', { name: /Update Attendance/ }));
    await waitFor(() => expect(commitInChunks).toHaveBeenCalledTimes(1));

    const batch = { set: jest.fn(), update: jest.fn() };
    commitInChunks.mock.calls[0][0].forEach((op) => op(batch));
    expect(batch.update).toHaveBeenCalledTimes(2); // s1, s2
    expect(batch.set).toHaveBeenCalledTimes(1);    // s3 gets a new record
    expect(batch.set.mock.calls[0][1]).toMatchObject({ studentId: 's3', present: true });
  });
});

describe('AttendanceForm — batch selection', () => {
  test('clearing the batch clears the roster', async () => {
    setup({ isAdmin: true, uid: 'admin1' });
    render(<AttendanceForm />);
    await chooseBatch();
    await waitFor(() => expect(screen.getByText('Aarav Sharma')).toBeInTheDocument());

    await userEvent.selectOptions(document.getElementById('att-batch'), '');
    // Previously the old batch's students stayed on screen under a blank select.
    expect(screen.queryByText('Aarav Sharma')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Attendance/ })).not.toBeInTheDocument();
  });
});
