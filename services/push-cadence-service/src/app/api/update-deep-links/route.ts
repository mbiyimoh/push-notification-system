import { NextRequest, NextResponse } from 'next/server';
import { updateExistingRecordsWithDeepLinks } from '@/lib/cadence';

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
        const { trackResultsLogs } = await req.json();
        
        if (!trackResultsLogs || !Array.isArray(trackResultsLogs)) {
            return NextResponse.json({ 
                success: false, 
                error: 'trackResultsLogs array is required' 
            }, { status: 400 });
        }

        const result = await updateExistingRecordsWithDeepLinks(trackResultsLogs);

        return NextResponse.json({ 
            success: true, 
            message: `Successfully updated ${result.updatedCount} records with deep_link data`,
            details: result
        }, { headers: corsHeaders() });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        console.error('Error in update-deep-links API:', error);
        return NextResponse.json({ 
            success: false, 
            error: 'Failed to update deep links',
            details: errorMessage 
        }, { status: 500, headers: corsHeaders() });
    }
}