import { NextRequest, NextResponse } from 'next/server';
import { convertAudienceToHistoricalRecords } from '@/lib/cadence';

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
        const file = formData.get('audienceFile') as File;
        const layerId = parseInt(formData.get('layerId') as string, 10);
        const pushTitle = formData.get('pushTitle') as string;
        const pushBody = formData.get('pushBody') as string;
        const deepLink = formData.get('deepLink') as string;
        const audienceDescription = formData.get('audienceDescription') as string;
        const sentAt = formData.get('sentAt') as string;
        
        // Validate required fields
        if (!file) {
            return NextResponse.json({ 
                success: false, 
                error: 'No audience file provided' 
            }, { status: 400 });
        }

        if (!file.name.endsWith('.csv')) {
            return NextResponse.json({ 
                success: false, 
                error: 'File must be a CSV' 
            }, { status: 400 });
        }

                if (layerId === undefined || layerId === null || ![1, 2, 3, 4, 5].includes(layerId)) {
            return NextResponse.json({
                success: false,
                error: 'Invalid layer ID. Must be 1, 2, 3, 4, or 5' 
            }, { status: 400 });
        }

        if (!pushTitle || !audienceDescription || !sentAt) {
            return NextResponse.json({ 
                success: false, 
                error: 'Missing required fields: pushTitle, audienceDescription, sentAt' 
            }, { status: 400 });
        }

        // Read CSV content
        const csvContent = await file.text();

        // Convert audience to historical records
        const result = await convertAudienceToHistoricalRecords(csvContent, {
            layerId,
            pushTitle,
            pushBody: pushBody || undefined,
            deepLink: deepLink || undefined,
            audienceDescription,
            sentAt
        });

        return NextResponse.json({ 
            success: true, 
            message: 'Audience successfully converted to historical records',
            details: result
        }, { headers: corsHeaders() });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        console.error('Error in audience-to-history conversion:', error);
        return NextResponse.json({ 
            success: false, 
            error: 'Failed to convert audience to historical records',
            details: errorMessage 
        }, { status: 500, headers: corsHeaders() });
    }
}