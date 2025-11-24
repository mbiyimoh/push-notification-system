// Individual Template API
// Get specific template details and create automations

import { NextRequest, NextResponse } from 'next/server';
import { automationTemplateSystem } from '@/lib/automationTemplates';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get specific template
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    const template = automationTemplateSystem.getTemplate(id);
    
    if (!template) {
      return NextResponse.json({
        success: false,
        message: 'Template not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: template,
      message: 'Template retrieved successfully'
    });

  } catch (error: any) {
    console.error('Error fetching template:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch template',
      errors: [error.message]
    }, { status: 500 });
  }
}

// POST - Create automation from specific template
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { variables = {}, overrides = {} } = body;

    // Get template
    const template = automationTemplateSystem.getTemplate(id);
    if (!template) {
      return NextResponse.json({
        success: false,
        message: 'Template not found'
      }, { status: 404 });
    }

    // Create automation from template
    const automation = automationTemplateSystem.createFromTemplate(id, variables, overrides);

    // Save automation
    const { automationStorage } = await import('@/lib/automationStorage');
    const saveResult = await automationStorage.saveAutomation(automation);
    
    if (!saveResult.success) {
      return NextResponse.json({
        success: false,
        message: 'Failed to save automation created from template',
        errors: [saveResult.message || 'Save failed']
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        automation,
        template: {
          id: template.id,
          name: template.name,
          category: template.category
        }
      },
      message: 'Automation created from template successfully'
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating automation from template:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to create automation from template',
      errors: [error.message]
    }, { status: 500 });
  }
}