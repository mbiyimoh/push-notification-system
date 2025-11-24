// Individual Automation API
// Get, update, and delete specific automations

import { NextRequest, NextResponse } from 'next/server';
import { automationStorage } from '@/lib/automationStorage';
import { getAutomationEngineInstance } from '@/lib/automationEngine';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Retrieve a specific automation by ID
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params; // FIX: Re-added await to correctly get the ID
    console.log(`✅ [API-RECIPES-ID] Received request to GET automation by ID: ${id}`);
    
    console.log(`[API-RECIPES-ID] Attempting to load automation ${id} from storage.`);
    const automation = await automationStorage.loadAutomation(id);

    if (automation) {
      console.log(`[API-RECIPES-ID] Successfully loaded automation ${id}.`);
      return NextResponse.json({ success: true, data: automation });
    } else {
      console.error(`[API-RECIPES-ID] CRITICAL: Automation with ID ${id} not found in storage.`);
      return NextResponse.json({ success: false, message: 'Automation not found' }, { status: 404 });
    }
  } catch (error) {
    console.error(`[API-RECIPES-ID] FATAL ERROR during GET for automation by ID:`, error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT - Update an existing automation
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    // Load existing automation
    const existingAutomation = await automationStorage.loadAutomation(id);
    if (!existingAutomation) {
      return NextResponse.json({
        success: false,
        message: 'Automation not found'
      }, { status: 404 });
    }

    // Update automation - explicitly preserve only essential fields from existing
    const updatedAutomation = {
      id: existingAutomation.id, // Preserve ID
      name: body.name || existingAutomation.name,
      description: body.description || existingAutomation.description,
      type: body.type || existingAutomation.type,
      status: body.status || existingAutomation.status,
      isActive: body.isActive !== undefined ? body.isActive : existingAutomation.isActive,
      schedule: body.schedule || existingAutomation.schedule, // Use new schedule completely
      template: body.template || existingAutomation.template,
      pushSequence: body.pushSequence || existingAutomation.pushSequence,
      audienceCriteria: body.audienceCriteria || existingAutomation.audienceCriteria,
      settings: body.settings || existingAutomation.settings,
      metadata: body.metadata || existingAutomation.metadata,
      createdAt: existingAutomation.createdAt,
      updatedAt: new Date().toISOString()
    };

    const saveResult = await automationStorage.saveAutomation(updatedAutomation);
    
    if (!saveResult.success) {
      return NextResponse.json(saveResult, { status: 500 });
    }

    const automationEngine = getAutomationEngineInstance();
    // CRITICAL FIX: Handle scheduling changes when automation is updated
    if (updatedAutomation.status === 'active' || updatedAutomation.isActive) {
      // Cancel existing schedule and create new one
      const scheduleResult = await automationEngine.scheduleAutomation(updatedAutomation);
      if (!scheduleResult.success) {
        return NextResponse.json({
          success: false,
          message: `Automation updated but rescheduling failed: ${scheduleResult.message}`,
          data: updatedAutomation
        }, { status: 207 });
      }
    } else if (updatedAutomation.status === 'inactive' || !updatedAutomation.isActive) {
      // CRITICAL FIX: Unschedule automation when it becomes inactive
      const unscheduleResult = await automationEngine.unscheduleAutomation(updatedAutomation.id);
      console.log(`[API] Automation ${updatedAutomation.id} set to inactive - unscheduled: ${unscheduleResult.success}`);
    }

    return NextResponse.json({
      success: true,
      data: updatedAutomation,
      message: 'Automation updated and rescheduled successfully'
    });

  } catch (error: any) {
    console.error('Error updating automation:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to update automation',
      errors: [error.message]
    }, { status: 500 });
  }
}

// DELETE - Delete specific automation
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const automationEngine = getAutomationEngineInstance();
    const { id } = await params;
    
    // Check if automation exists
    const existingAutomation = await automationStorage.loadAutomation(id);
    if (!existingAutomation) {
      return NextResponse.json({
        success: false,
        message: 'Automation not found'
      }, { status: 404 });
    }

    // Cancel if running
    if (existingAutomation.status === 'running') {
      await automationEngine.cancelAutomation(id, 'Automation deleted');
    }

    // Delete automation
    const deleteResult = await automationStorage.deleteAutomation(id);
    
    return NextResponse.json(deleteResult, { 
      status: deleteResult.success ? 200 : 500 
    });

  } catch (error: any) {
    console.error('Error deleting automation:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete automation',
      errors: [error.message]
    }, { status: 500 });
  }
}