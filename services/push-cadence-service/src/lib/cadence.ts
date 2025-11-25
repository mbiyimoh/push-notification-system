import pool from './db';

interface CadenceRule {
    name: string;
    value_in_hours?: number;
    value_count?: number;
}

interface ExclusionBreakdown {
    l3Cooldown: number;        // Layer 3: 72-hour cooldown
    l2l3WeeklyLimit: number;   // Combined L2/L3: max 3/week
    l5Cooldown: number;        // Layer 5: 96-hour cooldown
    invalidUuid: number;       // Invalid UUID format
}

export interface FilterResult {
    eligibleUserIds: string[];
    excludedCount: number;
    exclusionBreakdown: ExclusionBreakdown;
}

/**
 * Helper function to get database pool with null safety
 * Throws error if pool is not initialized (DATABASE_URL not configured)
 */
function getPool() {
    if (!pool) {
        throw new Error('Database pool not initialized. Configure PUSH_CADENCE_DATABASE_URL environment variable.');
    }
    return pool;
}

export const getCadenceRules = async (): Promise<Map<string, CadenceRule>> => {
    const query = 'SELECT name, value_in_hours, value_count FROM cadence_rules WHERE is_active = true';
    const result = await getPool().query(query);
    const rules = new Map<string, CadenceRule>();
    result.rows.forEach(row => {
        rules.set(row.name, {
            name: row.name,
            value_in_hours: row.value_in_hours,
            value_count: row.value_count,
        });
    });
    return rules;
};

export const filterUsersByCadence = async (userIds: string[], layerId: number): Promise<FilterResult> => {
    console.log(`[CADENCE] Starting cadence filtering for ${userIds.length} users, layerId: ${layerId}`);

    // Initialize exclusion breakdown
    const exclusionBreakdown: ExclusionBreakdown = {
        l3Cooldown: 0,
        l2l3WeeklyLimit: 0,
        l5Cooldown: 0,
        invalidUuid: 0,
    };

    if (layerId === 1) {
        console.log(`[CADENCE] Layer 1 detected - bypassing cadence rules`);
        return { eligibleUserIds: userIds, excludedCount: 0, exclusionBreakdown };
    }

    // Validate and filter UUIDs
    const validUserIds = userIds.filter(id => {
        const isValid = isValidUUID(id);
        if (!isValid) {
            console.warn(`[CADENCE] Invalid UUID detected and excluded: ${id}`);
        }
        return isValid;
    });

    // Track invalid UUIDs
    exclusionBreakdown.invalidUuid = userIds.length - validUserIds.length;

    if (validUserIds.length === 0) {
        console.warn(`[CADENCE] No valid UUIDs found in userIds array, returning empty results`);
        return { eligibleUserIds: [], excludedCount: exclusionBreakdown.invalidUuid, exclusionBreakdown };
    }

    console.log(`[CADENCE] Filtered to ${validUserIds.length} valid UUIDs (${exclusionBreakdown.invalidUuid} invalid excluded)`);

    const rules = await getCadenceRules();
    const l5CooldownRule = rules.get('layer_5_cooldown_hours');
    const l3CooldownRule = rules.get('layer_3_cooldown_hours');
    const combinedLimitRule = rules.get('combined_l2_l3_limit_hours');

    if (!l3CooldownRule || !combinedLimitRule) {
        console.error(`[CADENCE] Cadence rules not found in database. Missing: ${!l3CooldownRule ? 'layer_3_cooldown_hours' : ''} ${!combinedLimitRule ? 'combined_l2_l3_limit_hours' : ''}. Failing open.`);
        return { eligibleUserIds: validUserIds, excludedCount: exclusionBreakdown.invalidUuid, exclusionBreakdown };
    }

    const l5CooldownHours = l5CooldownRule?.value_in_hours || 96; // Default 96 hours if rule not found
    const l3CooldownHours = l3CooldownRule.value_in_hours!;
    const combinedLimitHours = combinedLimitRule.value_in_hours!;
    const combinedLimitCount = combinedLimitRule.value_count!;

    console.log(`[CADENCE] Using rules: L5=${l5CooldownHours}h, L3=${l3CooldownHours}h, Combined=${combinedLimitHours}h (max ${combinedLimitCount})`);

    const excludedUserIds = new Set<string>();

    // Rule 1: Layer 5 Cooldown (96 hours) - New User Series
    if (layerId === 5) {
        const query = `
            SELECT DISTINCT user_id
            FROM user_notifications
            WHERE user_id = ANY($1::uuid[])
              AND layer_id = 5
              AND sent_at >= NOW() - INTERVAL '${l5CooldownHours} hours'
        `;
        const result = await getPool().query(query, [validUserIds]);
        result.rows.forEach(row => excludedUserIds.add(row.user_id));
        exclusionBreakdown.l5Cooldown = result.rows.length;
        console.log(`[CADENCE] Layer 5 cooldown: excluded ${result.rows.length} users`);
    }

    // Rule 2: Layer 3 Cooldown (72 hours)
    if (layerId === 3) {
        const query = `
            SELECT DISTINCT user_id
            FROM user_notifications
            WHERE user_id = ANY($1::uuid[])
              AND layer_id = 3
              AND sent_at >= NOW() - INTERVAL '${l3CooldownHours} hours'
        `;
        const result = await getPool().query(query, [validUserIds]);
        result.rows.forEach(row => excludedUserIds.add(row.user_id));
        exclusionBreakdown.l3Cooldown = result.rows.length;
        console.log(`[CADENCE] Layer 3 cooldown: excluded ${result.rows.length} users`);
    }

    // Rule 3: Combined L2/L3 Limit
    const usersToCheckForCombinedLimit = validUserIds.filter(id => !excludedUserIds.has(id));
    if (usersToCheckForCombinedLimit.length > 0) {
        const query = `
            SELECT user_id, COUNT(*) as push_count
            FROM user_notifications
            WHERE user_id = ANY($1::uuid[])
              AND layer_id IN (2, 3)
              AND sent_at >= NOW() - INTERVAL '${combinedLimitHours} hours'
            GROUP BY user_id
            HAVING COUNT(*) >= $2
        `;
        const result = await getPool().query(query, [usersToCheckForCombinedLimit, combinedLimitCount]);
        result.rows.forEach(row => excludedUserIds.add(row.user_id));
        exclusionBreakdown.l2l3WeeklyLimit = result.rows.length;
        console.log(`[CADENCE] Combined L2/L3 limit: excluded ${result.rows.length} users`);
    }
    
    const eligibleUserIds = validUserIds.filter(id => !excludedUserIds.has(id));

    console.log(`[CADENCE] Filtering complete: ${eligibleUserIds.length} eligible, ${excludedUserIds.size} excluded`);
    console.log(`[CADENCE] Exclusion breakdown: L3=${exclusionBreakdown.l3Cooldown}, L2/L3=${exclusionBreakdown.l2l3WeeklyLimit}, L5=${exclusionBreakdown.l5Cooldown}, Invalid=${exclusionBreakdown.invalidUuid}`);

    return {
        eligibleUserIds,
        excludedCount: excludedUserIds.size,
        exclusionBreakdown
    };
};

export const trackNotification = async (
    userId: string,
    layerId: number,
    pushTitle: string,
    pushBody: string,
    audienceDescription: string
) => {
    const query = `
        INSERT INTO user_notifications (user_id, layer_id, push_title, push_body, audience_description)
        VALUES ($1, $2, $3, $4, $5)
    `;
    await getPool().query(query, [userId, layerId, pushTitle, pushBody, audienceDescription]);
};

// Historical Data Restoration Functions
interface HistoricalNotificationRow {
    user_id?: string;
    layer_id?: string;
    push_title?: string;
    push_body?: string;
    sent_at?: string;
    audience_description?: string;
    deep_link?: string;
    rowIndex: number;
}

interface TrackResultsLog {
    title: string;
    timestamp: string;
    status: string;
    isDryRun: boolean;
    deepLink?: string;
    totalCount?: number;
    audienceSize?: number;
}

interface ValidationResult {
    isValid: boolean;
    validData: HistoricalNotificationRow[];
    invalidRows: { rowIndex: number; errors: string[] }[];
    missingColumns: string[];
}

interface InsertResult {
    insertedCount: number;
    duplicatesSkipped: number;
    errors: string[];
}

export const validateHistoricalData = async (data: HistoricalNotificationRow[]): Promise<ValidationResult> => {
    const requiredColumns = ['user_id', 'layer_id', 'push_title', 'sent_at'];
    const validData: HistoricalNotificationRow[] = [];
    const invalidRows: { rowIndex: number; errors: string[] }[] = [];
    
    // Check if all required columns exist in the first row
    const firstRow = data[0] || {};
    const availableColumns = Object.keys(firstRow).filter(key => key !== 'rowIndex');
    const missingColumns = requiredColumns.filter(col => !availableColumns.includes(col));
    
    if (missingColumns.length > 0) {
        return {
            isValid: false,
            validData: [],
            invalidRows: [],
            missingColumns
        };
    }

    // Validate each row
    for (const row of data) {
        const errors: string[] = [];
        
        // Check required fields
        if (!row.user_id || row.user_id.trim() === '') {
            errors.push('user_id is required');
        }
        
        if (!row.layer_id || row.layer_id.trim() === '') {
            errors.push('layer_id is required');
        } else {
            const layerNum = parseInt(row.layer_id, 10);
            if (isNaN(layerNum) || ![1, 2, 3, 4, 5].includes(layerNum)) {
                errors.push('layer_id must be 1, 2, 3, 4, or 5');
            }
        }
        
        if (!row.push_title || row.push_title.trim() === '') {
            errors.push('push_title is required');
        }
        
        if (!row.sent_at || row.sent_at.trim() === '') {
            errors.push('sent_at is required');
        } else {
            // Validate date format
            const date = new Date(row.sent_at);
            if (isNaN(date.getTime())) {
                errors.push('sent_at must be a valid date');
            }
        }
        
        // Validate user_id format (UUID)
        if (row.user_id && !isValidUUID(row.user_id)) {
            errors.push('user_id must be a valid UUID');
        }
        
        if (errors.length > 0) {
            invalidRows.push({ rowIndex: row.rowIndex, errors });
        } else {
            validData.push(row);
        }
    }
    
    return {
        isValid: invalidRows.length === 0,
        validData,
        invalidRows,
        missingColumns: []
    };
};

export const bulkInsertHistoricalNotifications = async (data: HistoricalNotificationRow[]): Promise<InsertResult> => {
    const client = await getPool().connect();
    let insertedCount = 0;
    let duplicatesSkipped = 0;
    const errors: string[] = [];
    
    try {
        await client.query('BEGIN');
        
        for (const row of data) {
            try {
                // Check for duplicates based on user_id and sent_at
                const duplicateCheck = await client.query(
                    'SELECT id FROM user_notifications WHERE user_id = $1 AND sent_at = $2',
                    [row.user_id, row.sent_at]
                );
                
                if (duplicateCheck.rows.length > 0) {
                    duplicatesSkipped++;
                    continue;
                }
                
                // Insert the historical notification
                await client.query(`
                    INSERT INTO user_notifications (user_id, layer_id, push_title, push_body, audience_description, deep_link, sent_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    row.user_id,
                    parseInt(row.layer_id!, 10),
                    row.push_title,
                    row.push_body || null,
                    row.audience_description || 'Historical Import',
                    row.deep_link || null,
                    row.sent_at
                ]);
                
                insertedCount++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                errors.push(`Row ${row.rowIndex}: ${errorMessage}`);
            }
        }
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        errors.push(`Transaction error: ${errorMessage}`);
    } finally {
        client.release();
    }
    
    return {
        insertedCount,
        duplicatesSkipped,
        errors
    };
};

// Function to convert audience CSV + metadata to historical records
export const convertAudienceToHistoricalRecords = async (
    audienceCsvData: string,
    metadata: {
        layerId: number;
        pushTitle: string;
        pushBody?: string;
        deepLink?: string;
        audienceDescription: string;
        sentAt: string;
    }
): Promise<InsertResult> => {
    // Parse CSV data
    const lines = audienceCsvData.trim().split('\n');
    if (lines.length < 2) {
        return {
            insertedCount: 0,
            duplicatesSkipped: 0,
            errors: ['CSV must contain header and at least one data row']
        };
    }

    const header = lines[0].toLowerCase();
    const dataRows = lines.slice(1);
    const headerColumns = header.split(',').map(col => col.trim());
    
    // Find user_id column (flexible column naming)
    const userIdColumn = headerColumns.find(col => 
        ['user_id', 'userid', 'id', 'user id', 'user'].includes(col.replace(/"/g, ''))
    );
    
    if (!userIdColumn) {
        return {
            insertedCount: 0,
            duplicatesSkipped: 0,
            errors: ['CSV must contain a user_id column (or similar: user_id, userId, id, etc.)']
        };
    }

    const userIdIndex = headerColumns.indexOf(userIdColumn);
    
    // Extract user IDs and create historical records
    const historicalData: HistoricalNotificationRow[] = [];
    
    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const values = row.split(',').map(val => val.trim().replace(/^"|"$/g, ''));
        const userId = values[userIdIndex];
        
        if (userId && isValidUUID(userId)) {
            historicalData.push({
                user_id: userId,
                layer_id: String(metadata.layerId),
                push_title: metadata.pushTitle,
                push_body: metadata.pushBody || undefined,
                deep_link: metadata.deepLink || undefined,
                audience_description: metadata.audienceDescription,
                sent_at: metadata.sentAt,
                rowIndex: i + 2 // +2 for header and 0-indexing
            });
        }
    }

    // Validate and insert the historical data
    const validation = await validateHistoricalData(historicalData);
    
    if (!validation.isValid) {
        return {
            insertedCount: 0,
            duplicatesSkipped: 0,
            errors: validation.invalidRows.map(row => `Row ${row.rowIndex}: ${row.errors.join(', ')}`)
        };
    }

    return await bulkInsertHistoricalNotifications(validation.validData);
};

// Function to retroactively update existing records with deep_link data from Track Results
export const updateExistingRecordsWithDeepLinks = async (trackResultsLogs: TrackResultsLog[]): Promise<{
    updatedCount: number;
    matchedLogs: number;
    errors: string[];
}> => {
    const client = await getPool().connect();
    let updatedCount = 0;
    let matchedLogs = 0;
    const errors: string[] = [];

    try {
        await client.query('BEGIN');

        // Get all existing records that don't have deep_link set
        const existingRecords = await client.query(`
            SELECT id, push_title, sent_at, deep_link 
            FROM user_notifications 
            WHERE deep_link IS NULL OR deep_link = ''
            ORDER BY sent_at DESC
        `);

        console.log(`Found ${existingRecords.rows.length} records without deep_link data`);

        for (const record of existingRecords.rows) {
            try {
                // Find matching Track Results log
                const matchingLog = trackResultsLogs.find(log => {
                    if (!log.title || !log.timestamp) return false;
                    
                    // Match by title (exact match)
                    const titleMatch = log.title.trim() === record.push_title.trim();
                    
                    // Match by timestamp (within 5 minutes window)
                    const logTime = new Date(log.timestamp).getTime();
                    const recordTime = new Date(record.sent_at).getTime();
                    const timeDiff = Math.abs(logTime - recordTime);
                    const timeMatch = timeDiff <= (5 * 60 * 1000); // 5 minutes
                    
                    return titleMatch && timeMatch && log.status === 'completed' && !log.isDryRun;
                });

                if (matchingLog && matchingLog.deepLink) {
                    // Update the record with deep_link
                    await client.query(
                        'UPDATE user_notifications SET deep_link = $1 WHERE id = $2',
                        [matchingLog.deepLink, record.id]
                    );
                    updatedCount++;
                    matchedLogs++;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                errors.push(`Error updating record ${record.id}: ${errorMessage}`);
            }
        }

        await client.query('COMMIT');
        console.log(`Successfully updated ${updatedCount} records with deep_link data`);

    } catch (error) {
        await client.query('ROLLBACK');
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        errors.push(`Transaction error: ${errorMessage}`);
    } finally {
        client.release();
    }

    return {
        updatedCount,
        matchedLogs,
        errors
    };
};

// Function to match uploaded CSV with Track Results logs
export const findMatchingTrackResults = async (
    csvAudienceSize: number,
    trackResultsLogs: TrackResultsLog[]
): Promise<TrackResultsLog[]> => {
    // Filter to completed, non-dry-run logs from the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const candidateLogs = trackResultsLogs.filter(log => {
        const isCompleted = log.status === 'completed' && !log.isDryRun;
        const isRecent = new Date(log.timestamp) >= ninetyDaysAgo;
        // Use totalCount instead of audienceSize since that seems to be what's populated
        const hasAudienceSize = (log.totalCount ?? 0) > 0 || (log.audienceSize ?? 0) > 0;
        
        return isCompleted && isRecent && hasAudienceSize;
    });

    // Sort by audience size match quality (closer matches first)
    const matchedLogs = candidateLogs.map(log => {
        // Use totalCount if available, fallback to audienceSize
        const logAudienceSize = log.totalCount || log.audienceSize || 0;
        return {
            ...log,
            audienceSize: logAudienceSize, // Normalize the field
            audienceSizeDiff: Math.abs(logAudienceSize - csvAudienceSize),
            matchQuality: calculateMatchQuality(logAudienceSize, csvAudienceSize)
        };
    }).sort((a, b) => a.audienceSizeDiff - b.audienceSizeDiff);

    // Return top 10 matches
    return matchedLogs.slice(0, 10);
};

// Helper function to calculate match quality score
function calculateMatchQuality(logSize: number, csvSize: number): number {
    const diff = Math.abs(logSize - csvSize);
    const percentDiff = (diff / Math.max(logSize, csvSize)) * 100;
    
    if (percentDiff === 0) return 100; // Perfect match
    if (percentDiff <= 2) return 95;   // Very close
    if (percentDiff <= 5) return 85;   // Close
    if (percentDiff <= 10) return 70;  // Good
    if (percentDiff <= 20) return 50;  // Fair
    return 25; // Poor match
}

// Helper function to validate UUID format
function isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}
