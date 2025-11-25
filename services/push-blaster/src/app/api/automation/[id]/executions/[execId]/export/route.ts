import { NextRequest, NextResponse } from 'next/server';
import { automationLogger } from '@/lib/automationLogger';
import { exportExecutionToCsv, getExportFilename } from '@/lib/csvExporter';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; execId: string }> }
) {
  try {
    const { id, execId } = await params;
    const { searchParams } = new URL(req.url);

    const include = (searchParams.get('include') || 'all') as 'summary' | 'phases' | 'pushes' | 'all';

    const history = await automationLogger.loadExecutionHistory(id, 100);
    const execution = history.find(e => e.executionId === execId);

    if (!execution) {
      return NextResponse.json(
        { success: false, message: 'Execution not found' },
        { status: 404 }
      );
    }

    const csv = exportExecutionToCsv(execution, include);
    const filename = getExportFilename(execution);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error('Export error:', error);
    return NextResponse.json(
      { success: false, message: 'Export failed' },
      { status: 500 }
    );
  }
}
