import { NextRequest, NextResponse } from 'next/server';
import { filterUsersByCadence } from '@/lib/cadence';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userIds, layerId } = body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0 || !layerId) {
            return NextResponse.json({ error: 'Missing required parameters: userIds (array) and layerId (number)' }, { status: 400 });
        }

        const { eligibleUserIds, excludedCount, exclusionBreakdown } = await filterUsersByCadence(userIds, layerId);

        return NextResponse.json({ eligibleUserIds, excludedCount, exclusionBreakdown });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        console.error('Error in audience filtering API:', error);
        // Fail open: return all users if there's an error
        const { userIds } = await req.json().catch(() => ({ userIds: [] }));
        return NextResponse.json({
            eligibleUserIds: userIds,
            excludedCount: 0,
            exclusionBreakdown: { l3Cooldown: 0, l2l3WeeklyLimit: 0, l5Cooldown: 0, invalidUuid: 0 },
            error: 'An internal error occurred, failing open.',
            details: errorMessage
        }, { status: 500 });
    }
}
