// Universal Execution Timeline Calculator
// Building on existing scheduling logic for automation execution phases

import { UniversalAutomation, ExecutionPhase, AutomationPush } from '@/types/automation';

export interface TimelineEvent {
  phase: ExecutionPhase;
  scheduledTime: Date;
  description: string;
  pushId?: string;
  pushTitle?: string;
  estimatedDuration: number; // minutes
}

export interface ExecutionTimeline {
  automationId: string;
  automationName: string;
  totalDuration: number; // minutes
  events: TimelineEvent[];
  startTime: Date;
  endTime: Date;
  cancellationDeadline: Date;
}

export class TimelineCalculator {
  private logPrefix = '[TimelineCalculator]';

  /**
   * Calculate complete execution timeline for automation
   */
  calculateTimeline(automation: UniversalAutomation, baseDate?: Date): ExecutionTimeline {
    const startTime = baseDate || this.calculateNextExecution(automation);
    const events: TimelineEvent[] = [];
    
    // Phase 1: Audience Generation (T-30 minutes)
    const audienceGenTime = new Date(startTime.getTime() - (automation.schedule.leadTimeMinutes || 30) * 60 * 1000);
    events.push({
      phase: 'audience_generation',
      scheduledTime: audienceGenTime,
      description: this.getAudienceDescription(automation),
      estimatedDuration: 5
    });

    // Phase 2: Test Sending (T-25 minutes)
    if (automation.settings.dryRunFirst && automation.settings.testUserIds.length > 0) {
      const testTime = new Date(audienceGenTime.getTime() + 5 * 60 * 1000);
      events.push({
        phase: 'test_sending',
        scheduledTime: testTime,
        description: `Send test pushes to ${automation.settings.testUserIds.length} test users`,
        estimatedDuration: 3
      });
    }

    // Phase 3: Cancellation Window (T-25 to T-0)
    const cancellationStart = new Date(startTime.getTime() - automation.settings.cancellationWindowMinutes * 60 * 1000);
    events.push({
      phase: 'cancellation_window',
      scheduledTime: cancellationStart,
      description: `Cancellation window open until ${this.formatTime(startTime)}`,
      estimatedDuration: automation.settings.cancellationWindowMinutes
    });

    // Phase 4: Live Execution - Calculate push sequence timing
    const liveExecutionEvents = this.calculateSequenceTimeline(automation, startTime);
    events.push(...liveExecutionEvents);

    // Calculate end time based on sequence
    const lastEvent = events[events.length - 1];
    const endTime = new Date(lastEvent.scheduledTime.getTime() + lastEvent.estimatedDuration * 60 * 1000);

    const timeline: ExecutionTimeline = {
      automationId: automation.id,
      automationName: automation.name,
      totalDuration: Math.ceil((endTime.getTime() - audienceGenTime.getTime()) / (60 * 1000)),
      events: events.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime()),
      startTime: audienceGenTime,
      endTime,
      cancellationDeadline: startTime
    };

    this.log(`Timeline calculated for ${automation.id}: ${timeline.totalDuration} minutes total`);
    return timeline;
  }

  /**
   * Calculate next execution time based on schedule
   */
  calculateNextExecution(automation: UniversalAutomation): Date {
    const now = new Date();
    const schedule = automation.schedule;

    // Parse execution time
    const [hours, minutes] = schedule.executionTime.split(':').map(Number);

    switch (schedule.frequency) {
      case 'once':
        return new Date(schedule.startDate);

      case 'daily':
        const dailyNext = new Date();
        dailyNext.setHours(hours, minutes, 0, 0);
        
        // If time has passed today, schedule for tomorrow
        if (dailyNext <= now) {
          dailyNext.setDate(dailyNext.getDate() + 1);
        }
        return dailyNext;

      case 'weekly':
        // Default to next Monday at specified time
        const weeklyNext = new Date();
        weeklyNext.setHours(hours, minutes, 0, 0);
        const daysUntilMonday = (1 + 7 - weeklyNext.getDay()) % 7;
        weeklyNext.setDate(weeklyNext.getDate() + daysUntilMonday);
        
        if (weeklyNext <= now) {
          weeklyNext.setDate(weeklyNext.getDate() + 7);
        }
        return weeklyNext;

      case 'monthly':
        // Default to 1st of next month
        const monthlyNext = new Date();
        monthlyNext.setDate(1);
        monthlyNext.setHours(hours, minutes, 0, 0);
        monthlyNext.setMonth(monthlyNext.getMonth() + 1);
        return monthlyNext;

      default:
        throw new Error(`Unsupported frequency: ${schedule.frequency}`);
    }
  }

  /**
   * Calculate timeline for push sequence execution
   */
  private calculateSequenceTimeline(automation: UniversalAutomation, startTime: Date): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    let currentTime = new Date(startTime);

    for (const [index, push] of automation.pushSequence.entries()) {
      // Apply delay after previous push
      if (index > 0 && push.timing.delayAfterPrevious > 0) {
        currentTime = new Date(currentTime.getTime() + push.timing.delayAfterPrevious * 60 * 1000);
      }

      // Use absolute time if specified
      if (push.timing.absoluteTime) {
        const [hours, minutes] = push.timing.absoluteTime.split(':').map(Number);
        currentTime = new Date(startTime);
        currentTime.setHours(hours, minutes, 0, 0);
      }

      events.push({
        phase: 'live_execution',
        scheduledTime: new Date(currentTime),
        description: `Send push ${index + 1}: ${push.title}`,
        pushId: push.id,
        pushTitle: push.title,
        estimatedDuration: 2 // 2 minutes for push execution
      });

      // Update current time for next iteration
      currentTime = new Date(currentTime.getTime() + 2 * 60 * 1000);
    }

    return events;
  }

  /**
   * Get audience description based on criteria
   */
  private getAudienceDescription(automation: UniversalAutomation): string {
    const criteria = automation.audienceCriteria;
    const parts: string[] = [];

    if (criteria.trustedTraderStatus !== 'any') {
      parts.push(`${criteria.trustedTraderStatus} traders`);
    }

    if (criteria.activityDays > 0) {
      parts.push(`active in ${criteria.activityDays} days`);
    }

    if (criteria.minTrades > 0) {
      parts.push(`min ${criteria.minTrades} trades`);
    }

    if (criteria.dataPacks.length > 0) {
      parts.push(`with ${criteria.dataPacks.length} data packs`);
    }

    const audienceDesc = parts.length > 0 ? parts.join(', ') : 'all users';
    const pushCount = automation.pushSequence.length;
    
    return `Generate audience (${audienceDesc}) for ${pushCount} push${pushCount > 1 ? 'es' : ''}`;
  }

  /**
   * Check if automation can be cancelled at current time
   */
  canCancel(timeline: ExecutionTimeline, currentTime: Date = new Date()): {
    canCancel: boolean;
    reason: string;
    timeRemaining?: number; // minutes
  } {
    if (currentTime > timeline.cancellationDeadline) {
      return {
        canCancel: false,
        reason: 'Cancellation window has expired'
      };
    }

    const timeRemaining = Math.ceil((timeline.cancellationDeadline.getTime() - currentTime.getTime()) / (60 * 1000));
    
    return {
      canCancel: true,
      reason: 'Within cancellation window',
      timeRemaining
    };
  }

  /**
   * Get current phase for automation timeline
   */
  getCurrentPhase(timeline: ExecutionTimeline, currentTime: Date = new Date()): {
    currentPhase: ExecutionPhase;
    nextEvent?: TimelineEvent;
    timeUntilNext?: number; // minutes
  } {
    const now = currentTime.getTime();

    // Find the current or next event
    for (let i = 0; i < timeline.events.length; i++) {
      const event = timeline.events[i];
      const eventTime = event.scheduledTime.getTime();
      const eventEnd = eventTime + (event.estimatedDuration * 60 * 1000);

      // If we're in the middle of this event
      if (now >= eventTime && now < eventEnd) {
        const nextEvent = timeline.events[i + 1];
        return {
          currentPhase: event.phase,
          nextEvent,
          timeUntilNext: nextEvent ? Math.ceil((nextEvent.scheduledTime.getTime() - now) / (60 * 1000)) : undefined
        };
      }

      // If this event is in the future
      if (now < eventTime) {
        return {
          currentPhase: 'waiting',
          nextEvent: event,
          timeUntilNext: Math.ceil((eventTime - now) / (60 * 1000))
        };
      }
    }

    // All events are in the past
    return {
      currentPhase: 'completed'
    };
  }

  /**
   * Estimate total audience size based on criteria
   */
  estimateAudienceSize(automation: UniversalAutomation): {
    estimatedSize: number;
    confidence: 'low' | 'medium' | 'high';
    explanation: string;
  } {
    // This is a simplified estimation - in practice, this would query the database
    const criteria = automation.audienceCriteria;
    let baseSize = 10000; // Base user count
    
    // Apply filters to estimate reduction
    if (criteria.trustedTraderStatus === 'trusted') baseSize *= 0.3;
    if (criteria.trustedTraderStatus === 'non-trusted') baseSize *= 0.7;
    
    if (criteria.activityDays <= 7) baseSize *= 0.4;
    else if (criteria.activityDays <= 30) baseSize *= 0.7;
    
    if (criteria.minTrades > 0) {
      baseSize *= Math.max(0.1, 1 - (criteria.minTrades / 100));
    }

    const estimatedSize = Math.floor(baseSize);
    
    return {
      estimatedSize,
      confidence: 'medium',
      explanation: `Estimated based on ${criteria.trustedTraderStatus} traders, ${criteria.activityDays} day activity, ${criteria.minTrades} min trades`
    };
  }

  /**
   * Utility methods
   */
  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }

  private log(message: string): void {
    console.log(`${this.logPrefix} ${new Date().toISOString()} - ${message}`);
  }
}

// Export singleton instance
export const timelineCalculator = new TimelineCalculator();