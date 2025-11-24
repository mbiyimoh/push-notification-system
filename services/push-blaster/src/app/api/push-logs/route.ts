import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.join(process.cwd(), '.push-logs');

interface JobSummary {
  id: string;
  timestamp: string;
  status: 'in_progress' | 'completed' | 'failed';
  audienceDescription: string;
  audienceSize: number;
  title: string;
  body: string;
  deepLink?: string;
  isDryRun: boolean;
  successCount?: number;
  failureCount?: number;
  totalTokens?: number;
  errorMessage?: string;
}

// Ensure the logs directory exists
const ensureLogsDir = () => {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
};

// Read all job logs and create a summary
const readAllJobSummaries = (): JobSummary[] => {
  try {
    ensureLogsDir();
    const logFiles = fs.readdirSync(LOGS_DIR).filter(file => file.endsWith('.json'));
    const summaries: JobSummary[] = [];

    for (const file of logFiles) {
      try {
        const filePath = path.join(LOGS_DIR, file);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const logData = JSON.parse(fileContent);

        // Construct a summary object from the detailed log
        const summary: JobSummary = {
          id: logData.jobId,
          timestamp: logData.startTime,
          status: logData.status,
          audienceDescription: logData.request?.audienceDescription || 'N/A',
          audienceSize: logData.request?.audienceSize || 0,
          title: logData.request?.title || 'No Title',
          body: logData.request?.body || 'No Body',
          deepLink: logData.request?.deepLink,
          isDryRun: logData.request?.dryRun || false,
          successCount: logData.summary?.successCount,
          failureCount: logData.summary?.failedCount,
          totalTokens: logData.summary?.totalTokens,
          errorMessage: logData.summary?.errorMessage,
        };
        summaries.push(summary);
      } catch (e) {
        console.error(`Error parsing log file ${file}:`, e);
        // Skip corrupted or malformed log files
      }
    }

    // Sort by timestamp, newest first
    summaries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return summaries;
  } catch (error) {
    console.error('Error reading logs directory:', error);
    return [];
  }
};

// GET - Retrieve all log summaries
export async function GET() {
  try {
    const logs = readAllJobSummaries();
    // The frontend expects the audienceSize to be on the top level, let's remap for compatibility
    const compatibleLogs = logs.map(log => ({
        ...log,
        totalCount: log.totalTokens,
    }));
    return NextResponse.json({ success: true, logs: compatibleLogs });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to retrieve logs' 
    }, { status: 500 });
  }
}

// We are no longer writing to a single file, so the POST method is obsolete.
// The send-push route now handles writing individual job logs.
// You can remove the old POST function if it exists.
