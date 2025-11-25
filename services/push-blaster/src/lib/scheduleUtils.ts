/**
 * Schedule Utilities
 * Shared helpers for calculating automation schedule information
 */

import { UniversalAutomation } from '@/types/automation';
import { timelineCalculator } from './timelineCalculator';

/**
 * Get the next execution time for an automation.
 * Uses metadata.nextExecutionAt if available, otherwise calculates from schedule.
 *
 * @param automation - The automation to get next execution for
 * @returns ISO string of next execution time, or null if not scheduled
 */
export function getNextExecutionAt(automation: UniversalAutomation): string | null {
  // Use metadata if already populated
  if (automation.metadata.nextExecutionAt) {
    return automation.metadata.nextExecutionAt;
  }

  // Only calculate for active automations with schedule data
  if (!automation.isActive || automation.status === 'paused' || automation.status === 'draft') {
    return null;
  }

  if (!automation.schedule?.executionTime) {
    return null;
  }

  try {
    const nextExecution = timelineCalculator.calculateNextExecution(automation);
    return nextExecution.toISOString();
  } catch {
    // TimelineCalculator throws for unsupported frequencies
    return null;
  }
}

/**
 * Get the next execution time as a Date object.
 *
 * @param automation - The automation to get next execution for
 * @returns Date of next execution, or null if not scheduled
 */
export function getNextExecutionDate(automation: UniversalAutomation): Date | null {
  const isoString = getNextExecutionAt(automation);
  return isoString ? new Date(isoString) : null;
}
