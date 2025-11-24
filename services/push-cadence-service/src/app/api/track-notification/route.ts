import { NextRequest, NextResponse } from 'next/server';
import { trackNotification } from '@/lib/cadence';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, layerId, pushTitle, pushBody, audienceDescription } = body;

        if (!userId || !layerId || !pushTitle || !pushBody || !audienceDescription) {
            return NextResponse.json({ error: 'Missing required parameters: userId, layerId, pushTitle, pushBody, audienceDescription' }, { status: 400 });
        }

        await trackNotification(userId, layerId, pushTitle, pushBody, audienceDescription);

        return NextResponse.json({ success: true, message: 'Notification tracked successfully.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        console.error('Error in notification tracking API:', error);
        return NextResponse.json({ error: 'Failed to track notification.', details: errorMessage }, { status: 500 });
    }
}
