import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ExamDetail } from '../../api/types';
import { writeStaffSession } from '../../auth/storage';
import { renderRoute } from '../../test/render';
import { QuestionsTab } from './QuestionsTab';

const exam = {
  id: 11,
  code: 'NET-101',
  title: 'Networking Midterm',
  description: null,
  status: 'OPEN',
  durationMinutes: 60,
  allowExtension: true,
  maxStrikes: 3,
  instructions: null,
  opensAt: null,
  closesAt: null,
  createdAt: '2026-11-01T09:00:00Z',
  attemptCount: 0,
  submittedCount: 0,
  findingCount: 0,
  openFindingCount: 0,
  lastAnalysisAt: null,
  enrollmentCount: 0,
  releasedCount: 0,
  awaitingReleaseCount: 0,
  questions: [
    {
      id: 101,
      orderIndex: 0,
      prompt: 'Which protocol is connection oriented?',
      type: 'SINGLE_CHOICE',
      points: 5,
      maxWords: 250,
      content: {
        options: [
          { key: 'A', text: 'TCP' },
          { key: 'B', text: 'UDP' },
        ],
      },
      answerKey: { selectedKeys: ['A'] },
      explanation: 'TCP performs a handshake.',
    },
  ],
  resourceRules: [],
  permissions: [],
} satisfies ExamDetail;

describe('QuestionsTab', () => {
  it('previews the draft through the student renderer', async () => {
    const user = userEvent.setup();
    writeStaffSession({
      token: 'staff-token',
      user: { id: 2, email: 'lee@example.edu', displayName: 'Lee Lecturer', role: 'LECTURER' },
    });

    renderRoute(<QuestionsTab exam={exam} canManage />, {
      path: '/exams/:examId',
      initialEntry: '/exams/11',
    });

    await user.click(screen.getByRole('button', { name: 'Edit question 1' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Question type' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByText('Select one answer')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Question type' })).not.toBeInTheDocument();
    expect(screen.getByText(/Preview only/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'B. UDP' }));
    expect(screen.getByRole('radio', { name: 'B. UDP' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('combobox', { name: 'Question type' })).toBeInTheDocument();
  });
});
