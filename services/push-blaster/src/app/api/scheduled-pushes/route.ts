import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SCHEDULED_PUSHES_DIR = path.join(process.cwd(), '.scheduled-pushes');

interface AudienceFilters {
  lastActiveDays?: number;
  daysSinceLastActive_inactive?: number;
  tradedInLastDays?: number;
  notTradedInLastDays?: number;
  minLifetimeTrades?: number;
  maxLifetimeTrades?: number;
  hasTrustedTrader?: boolean;
  isTrustedTraderCandidate?: boolean | null;
  joinedAfterDate?: string;
  manualUserIds?: string[];
}

interface DataPacks {
  topTargetShoe: boolean;
  hottestShoeTraded: boolean;
  hottestShoeTradedLookback?: number;
  hottestShoeOffers: boolean;
  hottestShoeOffersLookback?: number;
}

interface AudienceCriteria {
  filters?: AudienceFilters;
  dataPacks?: DataPacks;
  manualUserIds?: string[];
}

interface ScheduledPush {
  id: string;
  createdAt: string;
  scheduledFor: string;
  title: string;
  body: string;
  deepLink?: string;
  audienceCriteria: AudienceCriteria;
  audienceDescription: string;
  status: 'scheduled' | 'sent' | 'cancelled';
}

// Ensure the scheduled pushes directory exists
const ensureScheduledPushesDir = () => {
  if (!fs.existsSync(SCHEDULED_PUSHES_DIR)) {
    fs.mkdirSync(SCHEDULED_PUSHES_DIR, { recursive: true });
  }
};

// Read all scheduled pushes from the directory
const readAllScheduledPushes = (): ScheduledPush[] => {
  try {
    ensureScheduledPushesDir();
    const pushFiles = fs.readdirSync(SCHEDULED_PUSHES_DIR).filter(file => file.endsWith('.json'));
    const scheduledPushes: ScheduledPush[] = [];

    for (const file of pushFiles) {
      try {
        const filePath = path.join(SCHEDULED_PUSHES_DIR, file);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const pushData = JSON.parse(fileContent) as ScheduledPush;
        scheduledPushes.push(pushData);
      } catch (e) {
        console.error(`Error parsing scheduled push file ${file}:`, e);
        // Skip corrupted or malformed push files
      }
    }

    // Sort by scheduled time, nearest first
    scheduledPushes.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

    return scheduledPushes;
  } catch (error) {
    console.error('Error reading scheduled pushes directory:', error);
    return [];
  }
};

// GET - Retrieve all scheduled pushes
export async function GET() {
  try {
    const scheduledPushes = readAllScheduledPushes();
    return NextResponse.json({ 
      success: true, 
      scheduledPushes 
    });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Failed to retrieve scheduled pushes' 
    }, { status: 500 });
  }
}

// POST - Create a new scheduled push
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      scheduledFor, 
      title, 
      body: pushBody, 
      deepLink, 
      audienceCriteria, 
      audienceDescription 
    } = body;

    // Validate required fields
    if (!scheduledFor || !title || !pushBody || !audienceCriteria || !audienceDescription) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: scheduledFor, title, body, audienceCriteria, and audienceDescription are required'
      }, { status: 400 });
    }

    // Validate scheduled time is in the future
    const scheduledTime = new Date(scheduledFor);
    if (scheduledTime <= new Date()) {
      return NextResponse.json({
        success: false,
        message: 'Scheduled time must be in the future'
      }, { status: 400 });
    }

    // Create the scheduled push object
    const scheduledPush: ScheduledPush = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      scheduledFor,
      title,
      body: pushBody,
      deepLink,
      audienceCriteria,
      audienceDescription,
      status: 'scheduled'
    };

    // Ensure directory exists and write the file
    ensureScheduledPushesDir();
    const filePath = path.join(SCHEDULED_PUSHES_DIR, `${scheduledPush.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(scheduledPush, null, 2));

    return NextResponse.json({
      success: true,
      message: 'Scheduled push created successfully',
      scheduledPush
    });

  } catch (error: any) {
    console.error('Error creating scheduled push:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Failed to create scheduled push'
    }, { status: 500 });
  }
}