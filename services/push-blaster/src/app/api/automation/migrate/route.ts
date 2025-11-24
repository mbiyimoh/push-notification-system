// Migration Utility API
// Convert existing scheduled pushes to universal automations

import { NextRequest, NextResponse } from 'next/server';
import { automationStorage } from '@/lib/automationStorage';
import { ScheduledPushMigration } from '@/types/automation';

// POST - Migrate scheduled pushes to automations
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scheduledPushIds, migrateAll = false } = body;

    // Load existing scheduled pushes
    const scheduledPushes = await automationStorage.loadScheduledPushes();
    
    if (scheduledPushes.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No scheduled pushes found to migrate',
        data: { migratedCount: 0, skippedCount: 0 }
      });
    }

    let migratedCount = 0;
    let skippedCount = 0;
    const migrationRecords: ScheduledPushMigration[] = [];
    const migratedAutomations = [];

    // Filter pushes to migrate
    const pushesToMigrate = migrateAll 
      ? scheduledPushes 
      : scheduledPushes.filter(push => scheduledPushIds?.includes(push.id));

    for (const scheduledPush of pushesToMigrate) {
      try {
        // Convert to automation
        const automation = await automationStorage.migrateScheduledPush(scheduledPush);
        
        // Save automation
        const saveResult = await automationStorage.saveAutomation(automation);
        
        if (saveResult.success) {
          // Create migration record
          const migrationRecord: ScheduledPushMigration = {
            scheduledPushId: scheduledPush.id,
            automationId: automation.id,
            migrationDate: new Date().toISOString(),
            preserveOriginal: true
          };

          await automationStorage.saveMigrationRecord(migrationRecord);
          migrationRecords.push(migrationRecord);
          migratedAutomations.push(automation);
          migratedCount++;
          
          console.log(`Migrated scheduled push ${scheduledPush.id} to automation ${automation.id}`);
        } else {
          console.error(`Failed to save migrated automation for ${scheduledPush.id}:`, saveResult.message);
          skippedCount++;
        }
        
      } catch (error: any) {
        console.error(`Failed to migrate scheduled push ${scheduledPush.id}:`, error);
        skippedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration completed: ${migratedCount} migrated, ${skippedCount} skipped`,
      data: {
        migratedCount,
        skippedCount,
        migrations: migrationRecords,
        automations: migratedAutomations
      }
    });

  } catch (error: any) {
    console.error('Error during migration:', error);
    return NextResponse.json({
      success: false,
      message: 'Migration failed',
      errors: [error.message]
    }, { status: 500 });
  }
}

// GET - Get migration status and history
export async function GET(req: NextRequest) {
  try {
    const scheduledPushes = await automationStorage.loadScheduledPushes();
    const automations = await automationStorage.loadAllAutomations();
    
    // Count migrated vs original scheduled pushes
    const migratedAutomations = automations.filter(automation => 
      automation.type === 'single_push' && automation.id.startsWith('migrated_')
    );

    return NextResponse.json({
      success: true,
      data: {
        scheduledPushesCount: scheduledPushes.length,
        migratedAutomationsCount: migratedAutomations.length,
        totalAutomationsCount: automations.length,
        availableForMigration: scheduledPushes.map(push => ({
          id: push.id,
          title: push.pushTitle || 'Untitled',
          scheduledDate: push.scheduledDate,
          scheduledTime: push.scheduledTime
        })),
        migrationStatus: {
          canMigrate: scheduledPushes.length > 0,
          recommendMigration: scheduledPushes.length > migratedAutomations.length
        }
      },
      message: 'Migration status retrieved successfully'
    });

  } catch (error: any) {
    console.error('Error getting migration status:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to get migration status',
      errors: [error.message]
    }, { status: 500 });
  }
}