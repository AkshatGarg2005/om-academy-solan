import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
// Student names appear both in the pending list and, once open, in the picker,
// so assertions must be scoped to one or the other.
const pendingList = () => within(document.getElementById('fee-pending-list'));
const picker = () => document.getElementById('fee-student');
const dropdown = () => within(screen.getByRole('listbox'));
const pickerSearch = () => screen.getByPlaceholderText('Search student...');
const openPicker = () => userEvent.click(picker());
const settle = (calls) => waitFor(() => expect(getDocs).toHaveBeenCalledTimes(calls));

describe('FeeForm — existing behaviour still works', () => {
  test('renders the pending summary with every unpaid student and the grand total', async () => {
    render(<FeeForm />);
    await ready();
    expect(pendingList().getByText('Aarav Sharma')).toBeInTheDocument();
    expect(pendingList().getByText('Priya Verma')).toBeInTheDocument();
    expect(screen.getByText('2 students with unpaid fees', { exact: false })).toBeInTheDocument();
    // Unfiltered, ₹3500 shows in both the header and the total row.
    const totalRow = screen.getByText('Total Pending').closest('div');
    expect(within(totalRow).getByText('₹3500')).toBeInTheDocument();
  });

  test('the picker starts on its placeholder and opens closed', async () => {
    render(<FeeForm />);
    await ready();
    expect(picker()).toHaveTextContent('Select student');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('FeeForm — pending list search', () => {
  test('filters by name and retotals to the matches', async () => {
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

  test('also matches on email', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.type(pendingSearch(), 'priya@example');
    expect(pendingList().getByText('Priya Verma')).toBeInTheDocument();
    expect(pendingList().queryByText('Aarav Sharma')).not.toBeInTheDocument();
  });

  test('no matches shows an empty message and hides the total row', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.type(pendingSearch(), 'zzzz');
    expect(screen.getByText(/No students match/)).toBeInTheDocument();
    expect(screen.queryByText('Total Pending')).not.toBeInTheDocument();
  });

  test('clearing restores the full list', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.type(pendingSearch(), 'aarav');
    expect(pendingList().queryByText('Priya Verma')).not.toBeInTheDocument();

    await userEvent.clear(pendingSearch());
    expect(pendingList().getByText('Priya Verma')).toBeInTheDocument();
    expect(screen.getByText('Total Pending')).toBeInTheDocument();
  });
});

describe('FeeForm — switching student', () => {
  const pick = async (name) => {
    await userEvent.click(picker());
    await userEvent.click(dropdown().getByRole('option', { name }));
  };

  test('never shows the previous student\'s fee records', async () => {
    // mockReset, not clearAllMocks: the latter leaves queued once-values from
    // the outer beforeEach in place, and this test needs the queue to itself.
    getDocs.mockReset();
    useAuth.mockReturnValue({ currentUser: { uid: 'admin1' }, isAdmin: true });
    loadStudents.mockResolvedValue(STUDENTS);
    getDocs
      .mockResolvedValueOnce(asSnap([]))                       // loadInitialData
      .mockResolvedValueOnce(asSnap([                          // Aarav's fees
        { id: 'f1', studentId: 's1', month: 'AARAV-JAN', amount: 111, paid: false, dueDate: '' },
      ]))
      .mockImplementationOnce(() => new Promise(() => {}));     // Priya's fees: still in flight

    render(<FeeForm />);
    await ready();

    await pick('Aarav Sharma');
    await waitFor(() => expect(screen.getByText('AARAV-JAN')).toBeInTheDocument());

    await pick('Priya Verma');
    // The heading switches immediately, so the rows must not lag behind it —
    // Paid/Edit/Delete carried the previous student's fee ids.
    expect(screen.getByRole('heading', { name: /Fee Records for Priya Verma/ })).toBeInTheDocument();
    expect(screen.queryByText('AARAV-JAN')).not.toBeInTheDocument();
  });

  test('a slow response for a deselected student is discarded', async () => {
    // mockReset, not clearAllMocks: the latter leaves queued once-values from
    // the outer beforeEach in place, and this test needs the queue to itself.
    getDocs.mockReset();
    useAuth.mockReturnValue({ currentUser: { uid: 'admin1' }, isAdmin: true });
    loadStudents.mockResolvedValue(STUDENTS);

    let releaseAarav;
    getDocs
      .mockResolvedValueOnce(asSnap([]))                                   // loadInitialData
      .mockImplementationOnce(() => new Promise((r) => { releaseAarav = r; }))
      .mockResolvedValueOnce(asSnap([                                      // Priya's fees
        { id: 'f2', studentId: 's2', month: 'PRIYA-FEB', amount: 222, paid: false, dueDate: '' },
      ]));

    render(<FeeForm />);
    await ready();

    await pick('Aarav Sharma');
    await pick('Priya Verma');
    await waitFor(() => expect(screen.getByText('PRIYA-FEB')).toBeInTheDocument());

    // Aarav's request now lands, after he stopped being the selection.
    await act(async () => {
      releaseAarav(asSnap([
        { id: 'f1', studentId: 's1', month: 'AARAV-JAN', amount: 111, paid: false, dueDate: '' },
      ]));
    });

    expect(screen.queryByText('AARAV-JAN')).not.toBeInTheDocument();
    expect(screen.getByText('PRIYA-FEB')).toBeInTheDocument();
  });
});

describe('FeeForm — search inside the student picker', () => {
  test('opening reveals a search box and every student', async () => {
    render(<FeeForm />);
    await ready();
    await openPicker();
    expect(pickerSearch()).toBeInTheDocument();
    expect(dropdown().getAllByRole('option')).toHaveLength(3);
  });

  test('typing narrows the options', async () => {
    render(<FeeForm />);
    await ready();
    await openPicker();
    await userEvent.type(pickerSearch(), 'rohan');
    const options = dropdown().getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Rohan Gupta');
  });

  test('matches on email too', async () => {
    render(<FeeForm />);
    await ready();
    await openPicker();
    await userEvent.type(pickerSearch(), 'priya@example');
    expect(dropdown().getAllByRole('option')).toHaveLength(1);
  });

  test('no matches shows the empty label', async () => {
    render(<FeeForm />);
    await ready();
    await openPicker();
    await userEvent.type(pickerSearch(), 'zzzz');
    expect(screen.getByText('No students found')).toBeInTheDocument();
  });

  test('choosing an option selects it and closes the dropdown', async () => {
    render(<FeeForm />);
    await ready();
    await openPicker();
    await userEvent.click(dropdown().getByRole('option', { name: 'Rohan Gupta' }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(picker()).toHaveTextContent('Rohan Gupta');
    await settle(2); // loadStudentFees fired for the selection
  });

  test('reopening resets the previous query', async () => {
    render(<FeeForm />);
    await ready();
    await openPicker();
    await userEvent.type(pickerSearch(), 'rohan');
    expect(dropdown().getAllByRole('option')).toHaveLength(1);

    await userEvent.keyboard('{Escape}');
    await openPicker();
    expect(pickerSearch()).toHaveValue('');
    expect(dropdown().getAllByRole('option')).toHaveLength(3);
  });

  test('a selection can be cleared again', async () => {
    render(<FeeForm />);
    await ready();
    await openPicker();
    await userEvent.click(dropdown().getByRole('option', { name: 'Rohan Gupta' }));
    await settle(2);

    await openPicker();
    // With a value set, a clear row appears above the students.
    await userEvent.click(dropdown().getByRole('option', { name: 'Select student' }));
    expect(picker()).toHaveTextContent('Select student');
  });

  test('Escape closes without selecting', async () => {
    render(<FeeForm />);
    await ready();
    await openPicker();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(picker()).toHaveTextContent('Select student');
  });

  test('the pending search does not disturb the picker', async () => {
    render(<FeeForm />);
    await ready();
    await userEvent.type(pendingSearch(), 'aarav');
    await openPicker();
    expect(dropdown().getAllByRole('option')).toHaveLength(3);
  });
});
