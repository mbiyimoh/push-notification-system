'use client';

import { AutomationStatus } from '@/types/automation';

interface StatusBadgeProps {
  status: AutomationStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<AutomationStatus, { color: string; label: string }> = {
  active: { color: 'green', label: 'Active' },
  running: { color: 'green', label: 'Running' },
  paused: { color: 'yellow', label: 'Paused' },
  failed: { color: 'red', label: 'Failed' },
  draft: { color: 'gray', label: 'Draft' },
  scheduled: { color: 'blue', label: 'Scheduled' },
  inactive: { color: 'gray', label: 'Inactive' },
  completed: { color: 'green', label: 'Completed' },
  cancelled: { color: 'gray', label: 'Cancelled' },
};

const colorClasses = {
  green: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    dot: 'bg-green-500',
  },
  yellow: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-500',
  },
  red: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    dot: 'bg-red-500',
  },
  gray: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    dot: 'bg-gray-500',
  },
  blue: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    dot: 'bg-blue-500',
  },
};

const sizeClasses = {
  sm: {
    container: 'px-2 py-1 text-xs',
    dot: 'w-1.5 h-1.5',
    gap: 'gap-1',
  },
  md: {
    container: 'px-3 py-1.5 text-sm',
    dot: 'w-2 h-2',
    gap: 'gap-1.5',
  },
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] || { color: 'gray', label: 'Unknown' };
  const colors = colorClasses[config.color as keyof typeof colorClasses] || colorClasses.gray;
  const sizes = sizeClasses[size];

  return (
    <span
      className={`inline-flex items-center ${sizes.gap} ${sizes.container} ${colors.bg} ${colors.text} rounded-full font-medium`}
    >
      <span className={`${sizes.dot} ${colors.dot} rounded-full`} />
      {config.label}
    </span>
  );
}
