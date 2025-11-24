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

// Helper function to get scheduled push by ID
const getScheduledPushById = (id: string): ScheduledPush | null => {
  try {
    const filePath = path.join(SCHEDULED_PUSHES_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent) as ScheduledPush;
  } catch (error) {
    console.error(`Error reading scheduled push ${id}:`, error);
    return null;
  }
};

// Helper function to save scheduled push
const saveScheduledPush = (scheduledPush: ScheduledPush): void => {
  const filePath = path.join(SCHEDULED_PUSHES_DIR, `${scheduledPush.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(scheduledPush, null, 2));
};

// GET - Retrieve a specific scheduled push
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const scheduledPush = getScheduledPushById(id);
    if (!scheduledPush) {
      return NextResponse.json({
        success: false,
        message: 'Scheduled push not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      scheduledPush
    });

  } catch (error: any) {
    console.error('Error retrieving scheduled push:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Failed to retrieve scheduled push'
    }, { status: 500 });
  }
}

// PUT - Update an existing scheduled push
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get the existing scheduled push
    const existingPush = getScheduledPushById(id);
    if (!existingPush) {
      return NextResponse.json({
        success: false,
        message: 'Scheduled push not found'
      }, { status: 404 });
    }

    // Check if push has already been sent (only prevent content modifications, allow status updates TO 'sent')
    const body = await req.json();
    const { status } = body;
    
    if (existingPush.status === 'sent' && !(Object.keys(body).length === 1 && status)) {
      return NextResponse.json({
        success: false,
        message: 'Cannot modify content of a push that has already been sent'
      }, { status: 400 });
    }

    const { 
      scheduledFor, 
      title, 
      body: pushBody, 
      deepLink 
    } = body;

    // Validate scheduled time if provided
    if (scheduledFor) {
      const scheduledTime = new Date(scheduledFor);
      if (scheduledTime <= new Date()) {
        return NextResponse.json({
          success: false,
          message: 'Scheduled time must be in the future'
        }, { status: 400 });
      }
    }

    // Update the scheduled push (only allow updating content, not audience criteria)
    const updatedPush: ScheduledPush = {
      ...existingPush,
      ...(scheduledFor && { scheduledFor }),
      ...(title && { title }),
      ...(pushBody && { body: pushBody }),
      ...(deepLink !== undefined && { deepLink }),
      ...(status && { status })
    };

    // Save the updated push
    saveScheduledPush(updatedPush);

    return NextResponse.json({
      success: true,
      message: 'Scheduled push updated successfully',
      scheduledPush: updatedPush
    });

  } catch (error: any) {
    console.error('Error updating scheduled push:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Failed to update scheduled push'
    }, { status: 500 });
  }
}

// DELETE - Delete a scheduled push
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Check if the scheduled push exists
    const existingPush = getScheduledPushById(id);
    if (!existingPush) {
      return NextResponse.json({
        success: false,
        message: 'Scheduled push not found'
      }, { status: 404 });
    }

    // Check if push has already been sent
    if (existingPush.status === 'sent') {
      return NextResponse.json({
        success: false,
        message: 'Cannot delete a push that has already been sent'
      }, { status: 400 });
    }

    // Delete the file
    const filePath = path.join(SCHEDULED_PUSHES_DIR, `${id}.json`);
    fs.unlinkSync(filePath);

    return NextResponse.json({
      success: true,
      message: 'Scheduled push deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting scheduled push:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Failed to delete scheduled push'
    }, { status: 500 });
  }
}