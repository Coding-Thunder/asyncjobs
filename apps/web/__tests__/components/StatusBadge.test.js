/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../../components/StatusBadge';

describe('StatusBadge', () => {
  it('renders "pending" for pending status', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders "processing" for processing status', () => {
    render(<StatusBadge status="processing" />);
    expect(screen.getByText('processing')).toBeInTheDocument();
  });

  it('renders "completed" for completed status', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('renders "failed" for failed status', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('defaults to "pending" for unknown status', () => {
    render(<StatusBadge status="unknown" />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });
});
