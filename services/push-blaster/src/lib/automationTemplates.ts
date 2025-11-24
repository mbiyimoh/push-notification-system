// Automation Templates System
// Pre-built templates for common automation patterns

import { UniversalAutomation, AutomationTemplate, TemplateCategory } from '@/types/automation';
import { v4 as uuidv4 } from 'uuid';

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  isSystemTemplate: boolean;
  variables: TemplateVariable[];
  defaultSchedule: any;
  pushTemplates: PushTemplate[];
  defaultSettings: any;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: string[];
  };
}

export interface PushTemplate {
  sequenceOrder: number;
  titleTemplate: string;
  bodyTemplate: string;
  deepLinkTemplate: string;
  layerId: number;
  timing: {
    delayAfterPrevious: number;
    absoluteTime?: string;
  };
  variables: string[]; // Variable names used in this push
}

export class AutomationTemplateSystem {
  private templates: Map<string, TemplateDefinition> = new Map();

  constructor() {
    this.initializeSystemTemplates();
  }

  /**
   * Initialize built-in system templates
   */
  private initializeSystemTemplates(): void {
    // Onboarding Funnel Template
    this.registerTemplate({
      id: 'onboarding_funnel',
      name: 'New User Onboarding Funnel',
      description: 'Progressive 4-step onboarding: add to closet → create offer → complete profile → add to wishlist',
      category: 'onboarding',
      isSystemTemplate: true,
      variables: [
        {
          name: 'user_segment',
          type: 'string',
          description: 'Target user segment',
          required: true,
          defaultValue: 'new_users',
          validation: {
            options: ['new_users', 'inactive_users', 'potential_traders']
          }
        },
        {
          name: 'delay_hours',
          type: 'number',
          description: 'Hours between each push',
          required: false,
          defaultValue: 24,
          validation: { min: 1, max: 168 }
        },
        {
          name: 'personalization_level',
          type: 'string',
          description: 'Level of personalization',
          required: false,
          defaultValue: 'basic',
          validation: {
            options: ['basic', 'personalized', 'advanced']
          }
        }
      ],
      defaultSchedule: {
        frequency: 'daily',
        executionTime: '10:00',
        leadTimeMinutes: 30
      },
      pushTemplates: [
        {
          sequenceOrder: 1,
          titleTemplate: 'Welcome to Tradeblock! Start building your closet 👟',
          bodyTemplate: 'Add your first sneaker to unlock exclusive trading opportunities',
          deepLinkTemplate: 'app://onboarding/add-closet?source=automation&segment={{user_segment}}',
          layerId: 5,
          timing: { delayAfterPrevious: 0 },
          variables: ['user_segment']
        },
        {
          sequenceOrder: 2,
          titleTemplate: 'Ready to make your first offer? 💰',
          bodyTemplate: 'Browse trending sneakers and make an offer to start trading',
          deepLinkTemplate: 'app://offers/create?source=automation&segment={{user_segment}}',
          layerId: 5,
          timing: { delayAfterPrevious: 0 }, // Will be set by delay_hours variable
          variables: ['user_segment']
        },
        {
          sequenceOrder: 3,
          titleTemplate: 'Complete your profile for better matches 📋',
          bodyTemplate: 'Add your size preferences and location for personalized recommendations',
          deepLinkTemplate: 'app://profile/complete?source=automation&segment={{user_segment}}',
          layerId: 5,
          timing: { delayAfterPrevious: 0 },
          variables: ['user_segment']
        },
        {
          sequenceOrder: 4,
          titleTemplate: 'Build your wishlist and get notified 🔔',
          bodyTemplate: 'Add sneakers to your wishlist and we\'ll alert you when they\'re available',
          deepLinkTemplate: 'app://wishlist/add?source=automation&segment={{user_segment}}',
          layerId: 5,
          timing: { delayAfterPrevious: 0 },
          variables: ['user_segment']
        }
      ],
      defaultSettings: {
        emergencyStopEnabled: true,
        dryRunFirst: true,
        cancellationWindowMinutes: 30,
        safeguards: {
          maxAudienceSize: 5000,
          requireTestFirst: true,
          emergencyContacts: [],
          alertThresholds: {
            audienceSize: 2500,
            failureRate: 0.1
          }
        }
      }
    });

    // Retention Campaign Template
    this.registerTemplate({
      id: 'retention_campaign',
      name: 'User Retention Campaign',
      description: 'Re-engage dormant users with personalized content',
      category: 'retention',
      isSystemTemplate: true,
      variables: [
        {
          name: 'inactivity_days',
          type: 'number',
          description: 'Days since last activity',
          required: true,
          defaultValue: 30,
          validation: { min: 7, max: 365 }
        },
        {
          name: 'incentive_type',
          type: 'string',
          description: 'Type of incentive to offer',
          required: false,
          defaultValue: 'none',
          validation: {
            options: ['none', 'discount', 'feature_highlight', 'social_proof']
          }
        }
      ],
      defaultSchedule: {
        frequency: 'weekly',
        executionTime: '15:00',
        leadTimeMinutes: 30
      },
      pushTemplates: [
        {
          sequenceOrder: 1,
          titleTemplate: 'We miss you at Tradeblock! 👋',
          bodyTemplate: 'Check out what\'s trending while you were away',
          deepLinkTemplate: 'app://discover/trending?source=retention&days={{inactivity_days}}',
          layerId: 2,
          timing: { delayAfterPrevious: 0 },
          variables: ['inactivity_days']
        }
      ],
      defaultSettings: {
        emergencyStopEnabled: true,
        dryRunFirst: true,
        cancellationWindowMinutes: 30,
        safeguards: {
          maxAudienceSize: 10000,
          requireTestFirst: true,
          emergencyContacts: [],
          alertThresholds: {
            audienceSize: 5000,
            failureRate: 0.1
          }
        }
      }
    });

    // Feature Announcement Template
    this.registerTemplate({
      id: 'feature_announcement',
      name: 'Feature Announcement',
      description: 'Announce new features to targeted user segments',
      category: 'feature_announcement',
      isSystemTemplate: true,
      variables: [
        {
          name: 'feature_name',
          type: 'string',
          description: 'Name of the new feature',
          required: true
        },
        {
          name: 'target_segment',
          type: 'string',
          description: 'User segment to target',
          required: true,
          defaultValue: 'all_users',
          validation: {
            options: ['all_users', 'power_users', 'new_users', 'trusted_traders']
          }
        },
        {
          name: 'urgency_level',
          type: 'string',
          description: 'Urgency level for the announcement',
          required: false,
          defaultValue: 'normal',
          validation: {
            options: ['low', 'normal', 'high', 'critical']
          }
        }
      ],
      defaultSchedule: {
        frequency: 'once',
        executionTime: '12:00',
        leadTimeMinutes: 30
      },
      pushTemplates: [
        {
          sequenceOrder: 1,
          titleTemplate: 'New: {{feature_name}} is here! 🚀',
          bodyTemplate: 'Discover how {{feature_name}} makes trading even better',
          deepLinkTemplate: 'app://features/{{feature_name}}?source=announcement&segment={{target_segment}}',
          layerId: 1,
          timing: { delayAfterPrevious: 0 },
          variables: ['feature_name', 'target_segment']
        }
      ],
      defaultSettings: {
        emergencyStopEnabled: true,
        dryRunFirst: true,
        cancellationWindowMinutes: 30,
        safeguards: {
          maxAudienceSize: 50000,
          requireTestFirst: true,
          emergencyContacts: [],
          alertThresholds: {
            audienceSize: 25000,
            failureRate: 0.05
          }
        }
      }
    });
  }

  /**
   * Register a new template
   */
  registerTemplate(template: TemplateDefinition): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): TemplateDefinition | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * List all templates with optional filtering
   */
  listTemplates(filters?: {
    category?: TemplateCategory;
    systemOnly?: boolean;
  }): TemplateDefinition[] {
    let templates = Array.from(this.templates.values());
    
    if (filters?.category) {
      templates = templates.filter(t => t.category === filters.category);
    }
    
    if (filters?.systemOnly) {
      templates = templates.filter(t => t.isSystemTemplate);
    }
    
    return templates;
  }

  /**
   * Create automation from template with variable substitution
   */
  createFromTemplate(
    templateId: string, 
    variables: { [key: string]: any },
    overrides?: Partial<UniversalAutomation>
  ): UniversalAutomation {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate required variables
    for (const variable of template.variables) {
      if (variable.required && !(variable.name in variables)) {
        throw new Error(`Required variable missing: ${variable.name}`);
      }
    }

    // Apply variable defaults
    const resolvedVariables = { ...variables };
    for (const variable of template.variables) {
      if (!(variable.name in resolvedVariables) && variable.defaultValue !== undefined) {
        resolvedVariables[variable.name] = variable.defaultValue;
      }
    }

    // Validate variables
    this.validateVariables(template, resolvedVariables);

    // Create automation ID
    const automationId = overrides?.id || uuidv4();

    // Build push sequence with variable substitution
    const pushSequence = template.pushTemplates.map((pushTemplate, index) => {
      // Apply delay_hours variable if present
      let delayAfterPrevious = pushTemplate.timing.delayAfterPrevious;
      if (resolvedVariables.delay_hours && index > 0) {
        delayAfterPrevious = resolvedVariables.delay_hours * 60; // Convert hours to minutes
      }

      return {
        id: uuidv4(),
        automationId,
        sequenceOrder: pushTemplate.sequenceOrder,
        title: this.substituteVariables(pushTemplate.titleTemplate, resolvedVariables),
        body: this.substituteVariables(pushTemplate.bodyTemplate, resolvedVariables),
        deepLink: this.substituteVariables(pushTemplate.deepLinkTemplate, resolvedVariables),
        layerId: pushTemplate.layerId,
        timing: {
          delayAfterPrevious,
          absoluteTime: pushTemplate.timing.absoluteTime
        },
        status: 'pending' as const
      };
    });

    // Create automation
    const automation: UniversalAutomation = {
      id: automationId,
      name: overrides?.name || `${template.name} - ${new Date().toLocaleDateString()}`,
      description: overrides?.description || `Created from template: ${template.name}`,
      type: 'sequence',
      status: 'draft',
      isActive: false, // Start as inactive by default
      schedule: {
        timezone: 'America/Chicago',
        ...template.defaultSchedule,
        ...(overrides?.schedule || {})
      },
      template: {
        id: template.id,
        name: template.name,
        category: template.category,
        isSystemTemplate: template.isSystemTemplate,
        config: {
          defaultSettings: template.defaultSettings,
          pushTemplates: template.pushTemplates,
          requiredVariables: template.variables.filter(v => v.required).map(v => v.name),
          usedVariables: resolvedVariables
        }
      },
      pushSequence,
      audienceCriteria: overrides?.audienceCriteria || {
        trustedTraderStatus: 'any',
        trustedTraderCandidate: 'any',
        activityDays: 30,
        tradingDays: 30,
        minTrades: 0,
        dataPacks: []
      },
      settings: {
        testUserIds: [],
        ...template.defaultSettings,
        ...(overrides?.settings || {})
      },
      metadata: {
        createdBy: 'template_system',
        templateId: template.id,
        templateVariables: resolvedVariables,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return automation;
  }

  /**
   * Validate template variables
   */
  private validateVariables(template: TemplateDefinition, variables: { [key: string]: any }): void {
    for (const variable of template.variables) {
      const value = variables[variable.name];
      
      if (value === undefined || value === null) {
        if (variable.required) {
          throw new Error(`Required variable ${variable.name} is missing`);
        }
        continue;
      }

      // Type validation
      if (variable.type === 'number' && typeof value !== 'number') {
        throw new Error(`Variable ${variable.name} must be a number`);
      }
      if (variable.type === 'string' && typeof value !== 'string') {
        throw new Error(`Variable ${variable.name} must be a string`);
      }
      if (variable.type === 'boolean' && typeof value !== 'boolean') {
        throw new Error(`Variable ${variable.name} must be a boolean`);
      }
      if (variable.type === 'array' && !Array.isArray(value)) {
        throw new Error(`Variable ${variable.name} must be an array`);
      }

      // Validation rules
      if (variable.validation) {
        const validation = variable.validation;
        
        if (validation.min !== undefined && value < validation.min) {
          throw new Error(`Variable ${variable.name} must be at least ${validation.min}`);
        }
        
        if (validation.max !== undefined && value > validation.max) {
          throw new Error(`Variable ${variable.name} must be at most ${validation.max}`);
        }
        
        if (validation.options && !validation.options.includes(value)) {
          throw new Error(`Variable ${variable.name} must be one of: ${validation.options.join(', ')}`);
        }
        
        if (validation.pattern && typeof value === 'string') {
          const regex = new RegExp(validation.pattern);
          if (!regex.test(value)) {
            throw new Error(`Variable ${variable.name} does not match required pattern`);
          }
        }
      }
    }
  }

  /**
   * Substitute variables in template strings
   */
  private substituteVariables(template: string, variables: { [key: string]: any }): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
      return variables[variableName]?.toString() || match;
    });
  }

  /**
   * Create onboarding automation with smart defaults
   */
  createOnboardingAutomation(variables: {
    user_segment?: string;
    delay_hours?: number;
    personalization_level?: string;
    executionTime?: string;
  } = {}): UniversalAutomation {
    return this.createFromTemplate('onboarding_funnel', variables, {
      name: `Onboarding Funnel - ${variables.user_segment || 'New Users'}`,
      schedule: {
        timezone: 'America/Chicago',
        frequency: 'daily' as const,
        startDate: new Date().toISOString().split('T')[0], // Default to today
        executionTime: variables.executionTime || '10:00',
        leadTimeMinutes: 30
      }
    });
  }
}

// Export singleton instance
export const automationTemplateSystem = new AutomationTemplateSystem();