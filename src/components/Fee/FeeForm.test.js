import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeeForm from './FeeForm';
import { useAuth } from '../../contexts/AuthContext';
import { loadStudents } from '../../utils/firestore';
import { getDocs } from 'firebase/firestore';

jest.mock('../../config/firebase', () => ({ db: {}, auth: {}, firebaseConfig: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), where: jest.fn(), doc: jest.fn(),
  getDocs: jest.fn(), addDoc: jest.fn(), updateDoc: jest.fn(), deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(),
}));
jest.mock('../../utils/firestore', () => ({ loadStudents: jest.fn(), queryByIds: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const STUDENTS = [
  { id: 's1', name: 'Aarav Sharma', email: 'aarav@example.com' },
  { id: 's2', name: 'Priya Verma', email: 'priya@example.com' },
  { id: 's3', name: 'Rohan Gupta', email: 'rohan@example.com' },
];
const PENDING = [
  { id: 'f1', studentId: 's1', month: 'June 2026', amount: 2000, paid: false, dueDate: '' },
  { id: 'f2', studentId: 's2', month: 'June 2026', amount: 1500, paid: false, dueDate: '' },
];
const asSnap = (records) => ({
  size: records.length,
  docs: records.map(({ id, ...rest }) => ({ id, data: () => rest })),
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'admin1' }, isAdmin: true });
  loadStudents.mockResolvedValue(STUDENTS);
  // First call is the unpaid-fees query in loadInitialData; later calls are
  // loadStudentFees for whichever student gets selected.
  getDocs.mockResolvedValueOnce(asSnap(PENDING)).mockResolvedValue(asSnap([]));
});

// 'Add Fee Entry' is both the card heading and the submit button, so match the heading.
const ready = () => waitFor(() =>
  expect(screen.getByRole('heading', { name: 'Add Fee Entry' })).toBeInTheDocument());
const pendingSearch = () => screen.getByPlaceholderText('Search students with pending fees...');
const studentSearch = () => screen.getByPlaceholderText('Search student...');
const picker = () => document.getElementById('fee-student');
// Student names appear both in the pending list and as <option>s in the picker,
// so pending-list assertions must be scoped to the list itself.
const pendingList = () => within(document.getElementById('fee-pending-list'));

describe('FeeForm — existing behaviour still works', () => {
  test('renders the pending summary with every unpaid student and the grand total', async () => {
    render(<FeeForm />);
    await ready();
    expect(pendingList().getByText('Aarav Sharma')).toBeInTheDocument();
    expect(pendingList().getByText('Priya Verma')).toBeInTheDocument();
    expect(screen.getByText('2 students with unpaid fees', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Total Pending')).toBeInTheDocument();
    expect(screen.getAllByText('₹3500').length).toBeGreaterThan(0);
  });

  test('the student picker lists every student', async () => {
    render(<FeeForm />);
    await ready();
    expect(within(picker()).getAllByRole('option')).toHaveLength(4); // 3 + placeholder
  });
});

describe('FeeForm — new search behaviour', () => {
  test('pending search filters by name and retotals to the matches', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.type(pendingSearch(), 'aarav');

    expect(pendingList().getByText('Aarav Sharma')).toBeInTheDocument();
    expect(pendingList().queryByText('Priya Verma')).not.toBeInTheDocument();
    // ₹2000 legitimately appears twice: on Aarav's row and in the total, so
    // assert against the total row itself.
    const totalRow = screen.getByText('Total for 1 match').closest('div');
    expect(within(totalRow).getByText('₹2000')).toBeInTheDocument();
    // Header keeps the true overall total while filtered.
    expect(screen.getByText('₹3500')).toBeInTheDocument();
  });

  test('pending search also matches on email', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.type(pendingSearch(), 'priya@example');
    expect(pendingList().getByText('Priya Verma')).toBeInTheDocument();
    expect(pendingList().queryByText('Aarav Sharma')).not.toBeInTheDocument();
  });

  test('a search with no matches shows an empty message and hides the total row', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.type(pendingSearch(), 'zzzz');
    expect(screen.getByText(/No students match/)).toBeInTheDocument();
    expect(screen.queryByText('Total Pending')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Total for/)).not.toBeInTheDocument();
  });

  test('student search narrows the picker', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.type(studentSearch(), 'rohan');
    const options = within(picker()).getAllByRole('option');
    expect(options).toHaveLength(2); // placeholder + Rohan
    expect(within(picker()).getByRole('option', { name: 'Rohan Gupta' })).toBeInTheDocument();
  });

  test('the selected student survives a search that would exclude them', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.selectOptions(picker(), 's1');
    expect(picker().value).toBe('s1');
    // Selecting triggers loadStudentFees; let it settle so its state update is
    // not left dangling outside act().
    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(2));

    await userEvent.type(studentSearch(), 'rohan');
    // Aarav is selected, so he stays listed even though he does not match.
    expect(within(picker()).getByRole('option', { name: 'Aarav Sharma' })).toBeInTheDocument();
    expect(picker().value).toBe('s1');
  });

  test('pending search leaves the student picker untouched', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.type(pendingSearch(), 'aarav');
    expect(within(picker()).getAllByRole('option')).toHaveLength(4);
  });

  test('clearing the search restores the full lists', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.type(pendingSearch(), 'aarav');
    expect(pendingList().queryByText('Priya Verma')).not.toBeInTheDocument();

    await userEvent.clear(pendingSearch());
    expect(pendingList().getByText('Priya Verma')).toBeInTheDocument();
    expect(screen.getByText('Total Pending')).toBeInTheDocument();
  });
});
