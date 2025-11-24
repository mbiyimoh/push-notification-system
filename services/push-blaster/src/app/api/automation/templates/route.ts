// Automation Templates API
// Manage templates and create automations from templates

import { NextRequest, NextResponse } from 'next/server';
import { automationTemplateSystem } from '@/lib/automationTemplates';
import { automationStorage } from '@/lib/automationStorage';

// GET - List available templates
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const systemOnly = searchParams.get('systemOnly') === 'true';

    const filters = {
      ...(category && { category: category as any }),
      ...(systemOnly && { systemOnly })
    };

    const templates = automationTemplateSystem.listTemplates(Object.keys(filters).length > 0 ? filters : undefined);

    return NextResponse.json({
      success: true,
      data: templates,
      message: `Found ${templates.length} templates`
    });

  } catch (error: any) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch templates',
      errors: [error.message]
    }, { status: 500 });
  }
}

// POST - Create automation from template
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { templateId, variables = {}, overrides = {} } = body;

    if (!templateId) {
      return NextResponse.json({
        success: false,
        message: 'Template ID is required',
        errors: ['Missing templateId']
      }, { status: 400 });
    }

    // Get template
    const template = automationTemplateSystem.getTemplate(templateId);
    if (!template) {
      return NextResponse.json({
        success: false,
        message: 'Template not found',
        errors: ['Template does not exist']
      }, { status: 404 });
    }

    // Create automation from template
    const automation = automationTemplateSystem.createFromTemplate(templateId, variables, overrides);

    // Save automation
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