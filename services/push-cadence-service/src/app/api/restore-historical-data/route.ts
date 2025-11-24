import { NextRequest, NextResponse } from 'next/server';
import { bulkInsertHistoricalNotifications, validateHistoricalData } from '@/lib/cadence';

// Add CORS headers
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        
        if (!file) {
            return NextResponse.json({ 
                success: false, 
                error: 'No file provided' 
            }, { status: 400 });
        }

        if (!file.name.endsWith('.csv')) {
            return NextResponse.json({ 
                success: false, 
                error: 'File must be a CSV' 
            }, { status: 400 });
        }

        // Read and parse CSV content
        const csvContent = await file.text();
        const lines = csvContent.trim().split('\n');
        
        if (lines.length < 2) {
            return NextResponse.json({ 
                success: false, 
                error: 'CSV must contain header and at least one data row' 
            }, { status: 400 });
        }

        const header = lines[0].toLowerCase();
        const dataRows = lines.slice(1);

        // Parse CSV rows into objects
        const headerColumns = header.split(',').map(col => col.trim());
        const historicalData = dataRows.map((row, index) => {
            const values = row.split(',').map(val => val.trim().replace(/^"|"$/g, ''));
            const rowData: Record<string, string | null> = {};
            
            headerColumns.forEach((col, i) => {
                rowData[col] = values[i] || null;
            });
            
            return {
                ...rowData,
                rowIndex: index + 2 // +2 because of header and 0-indexing
            };
        });

        // Validate the historical data
        const validation = await validateHistoricalData(historicalData);
        
        if (!validation.isValid) {
            return NextResponse.json({ 
                success: false, 
                error: 'Data validation failed',
                details: {
                    invalidRows: validation.invalidRows,
                    missingColumns: validation.missingColumns,
                    totalRows: historicalData.length
                }
            }, { status: 400 });
        }

        // Insert valid historical data
        const insertResult = await bulkInsertHistoricalNotifications(validation.validData);

        return NextResponse.json({ 
            success: true, 
            message: 'Historical data restored successfully',
            details: {
                totalRows: historicalData.length,
                validRows: validation.validData.length,
                insertedRows: insertResult.insertedCount,
                duplicatesSkipped: insertResult.duplicatesSkipped,
                errors: insertResult.errors
            }
        }, { headers: corsHeaders() });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        console.error('Error in historical data restoration:', error);
        return NextResponse.json({ 
            success: false, 
            error: 'Failed to restore historical data',
            details: errorMessage 
        }, { status: 500, headers: corsHeaders() });
    }
}