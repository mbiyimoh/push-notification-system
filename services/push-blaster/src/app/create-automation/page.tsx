'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';

// Helper function - now just returns send time directly (NO subtraction)
// The leadTimeMinutes offset is handled by buildCronExpression() in automationEngine
function calculateExecutionTime(sendTime: string): string {
  // FIXED: executionTime now stores send time directly
  // The 30-minute automation start offset is handled by leadTimeMinutes in buildCronExpression()
  return sendTime;
}

interface ScriptAudience {
  name: string;
  description: string;
}

interface AvailableScript {
  id: string;
  name: string;
  description: string;
  audiences: ScriptAudience[];
  category: string;
  estimatedRuntime: number;
  lastModified: string;
  requiresParameters?: string[];
}

interface PushContent {
  audienceName: string;
  audienceDescription: string;
  title: string;
  body: string;
  deepLink: string;
  layerId: number;
}

export default function CreateAutomationPage() {
  const router = useRouter();
  
  // State management
  const [currentStep, setCurrentStep] = useState(1); // 1: method, 2: script/template, 3: schedule, 4: content
  const [creationType, setCreationType] = useState<'template' | 'script' | ''>('');
  const [availableScripts, setAvailableScripts] = useState<AvailableScript[]>([]);
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  // Automation configuration
  const [automationConfig, setAutomationConfig] = useState({
    name: '',
    frequency: 'daily' as 'once' | 'daily' | 'weekly',
    scheduledDate: '',
    sendTime: '10:00'
  });
  
  // Multi-push content
  const [pushContents, setPushContents] = useState<PushContent[]>([]);
  const [currentPushIndex, setCurrentPushIndex] = useState(0);
  
  // Response handling
  const [response, setResponse] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch available scripts
  const fetchAvailableScripts = async () => {
    try {
      const response = await fetch('/api/scripts');
      const result = await response.json();
      if (result.success) {
        setAvailableScripts(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch scripts:', error);
    }
  };

  useEffect(() => {
    fetchAvailableScripts();
  }, []);

  // Initialize push contents when script is selected
  const initializePushContents = (script: AvailableScript) => {
    const contents = script.audiences.map((audience) => ({
      audienceName: audience.name,
      audienceDescription: audience.description,
      title: `New ${audience.name.replace(/_/g, ' ')} update`,
      body: `Check out the latest updates for ${audience.description.toLowerCase()}`,
      deepLink: '',
      layerId: audience.name.includes('level') || audience.name.includes('new_user') || audience.name.includes('new_star') ? 5 : 2
    }));
    setPushContents(contents);
    setCurrentPushIndex(0);
  };

  // Navigation handlers
  const handleNext = () => {
    if (currentStep === 1 && creationType) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (creationType === 'script' && selectedScript) {
        const script = availableScripts.find(s => s.id === selectedScript);
        if (script) {
          if (!automationConfig.name) {
            setAutomationConfig(prev => ({
              ...prev,
              name: `Daily ${script.name}`
            }));
          }
          initializePushContents(script);
        }
        setCurrentStep(3);
      } else if (creationType === 'template' && selectedTemplate) {
        setCurrentStep(3);
      }
    } else if (currentStep === 3 && automationConfig.name) {
      setCurrentStep(4);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    router.push('/');
  };

  // Create automation
  const handleCreateAutomation = async (isDraft: boolean = false) => {
    if (!automationConfig.name) {
      setResponse({
        success: false,
        message: 'Please provide an automation name'
      });
      return;
    }

    if (creationType === 'script') {
      const incompletePushes = pushContents.filter(push => !push.title || !push.body);
      if (incompletePushes.length > 0) {
        setResponse({
          success: false,
          message: `Please complete all push notifications (${incompletePushes.length} still need title and body)`
        });
        return;
      }
    }

    setLoading(true);
    try {
      if (creationType === 'script') {
        const script = availableScripts.find(s => s.id === selectedScript);
        if (!script) {
          throw new Error('Selected script not found');
        }

        const automationData = {
          name: automationConfig.name,
          description: `Script-based automation using ${script.name}`,
          type: 'script_based',
          status: isDraft ? 'draft' : 'active',
          isActive: !isDraft,
          schedule: {
            frequency: automationConfig.frequency,
            scheduledDate: automationConfig.frequency === 'once' ? automationConfig.scheduledDate : undefined,
            timezone: 'America/Chicago',
            executionTime: calculateExecutionTime(automationConfig.sendTime),
            leadTimeMinutes: 30,
            startDate: automationConfig.frequency === 'once' ? automationConfig.scheduledDate : new Date().toISOString().split('T')[0]
          },
          template: {
            name: 'Script-Based Automation',
            category: 'custom',
            isSystemTemplate: false,
            config: {}
          },
          pushSequence: pushContents.map((pushContent, index) => ({
            sequenceOrder: index + 1,
            title: pushContent.title,
            body: pushContent.body,
            deepLink: pushContent.deepLink || '',
            layerId: pushContent.layerId,
            audienceName: pushContent.audienceName,
            timing: {
              delayAfterPrevious: index === 0 ? 0 : 5,
              scheduledTime: automationConfig.scheduledDate
            },
            status: 'pending'
          })),
          audienceCriteria: {
            trustedTraderStatus: 'any',
            trustedTraderCandidate: 'any',
            activityDays: 30,
            tradingDays: 30,
            dataPacks: [],
            customScript: {
              scriptId: selectedScript,
              parameters: {}
            }
          }
        };

        const response = await fetch('/api/automation/recipes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(automationData)
        });

        const result = await response.json();
        if (result.success) {
          setResponse({
            success: true,
            message: `"${automationConfig.name}" ${isDraft ? 'saved as draft' : 'automation created'} successfully!`
          });
          setTimeout(() => {
            router.push('/');
          }, 2000);
        } else {
          setResponse({
            success: false,
            message: result.message || 'Failed to create script automation'
          });
        }
      } else if (creationType === 'template') {
        // Handle template creation
        const response = await fetch('/api/automation/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateType: selectedTemplate,
            name: automationConfig.name,
            frequency: automationConfig.frequency,
            scheduledTime: automationConfig.sendTime,
            scheduledDate: automationConfig.scheduledDate
          })
        });

        const result = await response.json();
        if (result.success) {
          setResponse({
            success: true,
            message: `"${automationConfig.name}" template automation created successfully!`
          });
          setTimeout(() => {
            router.push('/');
          }, 2000);
        } else {
          setResponse({
            success: false,
            message: result.message || 'Failed to create template automation'
          });
        }
      }
    } catch (error: any) {
      setResponse({
        success: false,
        message: error.message || 'Failed to create automation'
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePushContent = (field: keyof PushContent, value: string | number) => {
    const newContents = [...pushContents];
    if (newContents[currentPushIndex]) {
      (newContents[currentPushIndex] as any)[field] = value;
      setPushContents(newContents);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create New Automation</h1>
              <p className="text-gray-600 mt-1">Set up automated push notification campaigns</p>
            </div>
            <Button
              onClick={handleCancel}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              ← Back to Dashboard
            </Button>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-center space-x-4 mb-8">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                currentStep >= step 
                  ? 'bg-blue-600 text-white border-blue-600' 
                  : 'bg-white text-gray-400 border-gray-300'
              }`}>
                {step}
              </div>
              {step < 4 && (
                <div className={`w-16 h-0.5 mx-2 ${
                  currentStep > step ? 'bg-blue-600' : 'bg-gray-300'
                }`}></div>
              )}
            </div>
          ))}
        </div>

        <div className="text-center mb-8">
          <h2 className="text-xl font-semibold text-gray-800">
            {currentStep === 1 && 'Choose Creation Method'}
            {currentStep === 2 && `Select ${creationType === 'script' ? 'Script' : 'Template'}`}
            {currentStep === 3 && 'Configure Schedule'}
            {currentStep === 4 && 'Draft Push Content'}
          </h2>
          <p className="text-gray-600 mt-1">
            {currentStep === 1 && 'Start with a template or create custom script-based automation'}
            {currentStep === 2 && `Choose the ${creationType === 'script' ? 'audience generation script' : 'template'} for your automation`}
            {currentStep === 3 && 'Set when and how often your automation should run'}
            {currentStep === 4 && 'Create push notification content for each audience'}
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-sm border p-8">
          {/* Step 1: Creation Method */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Template Option */}
                <div 
                  onClick={() => setCreationType('template')}
                  className={`p-6 border-2 rounded-lg cursor-pointer transition-all ${
                    creationType === 'template' 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl">🎯</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Use Template</h3>
                    <p className="text-gray-600 text-sm">
                      Start with pre-built automation templates for onboarding, retention, or feature announcements
                    </p>
                  </div>
                </div>

                {/* Script Option */}
                <div 
                  onClick={() => setCreationType('script')}
                  className={`p-6 border-2 rounded-lg cursor-pointer transition-all ${
                    creationType === 'script' 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl">⚙️</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Custom Script</h3>
                    <p className="text-gray-600 text-sm">
                      Use Python scripts to generate dynamic audiences and create multi-audience campaigns
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Script/Template Selection */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {creationType === 'script' ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Scripts</h3>
                  <div className="grid gap-4">
                    {availableScripts.map((script) => (
                      <div
                        key={script.id}
                        onClick={() => setSelectedScript(script.id)}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          selectedScript === script.id 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{script.name}</h4>
                            <p className="text-gray-600 text-sm mt-1">{script.description}</p>
                            <div className="flex items-center space-x-4 mt-2">
                              <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                                {script.audiences.length} audiences
                              </span>
                              <span className="text-xs text-gray-500">
                                ~{script.estimatedRuntime}s runtime
                              </span>
                            </div>
                          </div>
                        </div>
                        {selectedScript === script.id && (
                          <div className="mt-4 pt-4 border-t">
                            <h5 className="font-medium text-gray-800 mb-2">Generated Audiences:</h5>
                            <div className="space-y-1">
                              {script.audiences.map((audience, index) => (
                                <div key={index} className="text-sm text-gray-600">
                                  <span className="font-medium">{audience.name.replace(/_/g, ' ')}</span>: {audience.description}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Templates</h3>
                  <div className="grid gap-4">
                    {[
                      { id: 'onboarding_funnel', name: 'Onboarding Funnel', description: 'Welcome new users with a 4-push sequence' },
                      { id: 'retention_campaign', name: 'Retention Campaign', description: 'Re-engage inactive users' },
                      { id: 'feature_announcement', name: 'Feature Announcement', description: 'Announce new features to active users' }
                    ].map((template) => (
                      <div
                        key={template.id}
                        onClick={() => setSelectedTemplate(template.id)}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          selectedTemplate === template.id 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <h4 className="font-semibold text-gray-900">{template.name}</h4>
                        <p className="text-gray-600 text-sm mt-1">{template.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Schedule Configuration */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Automation Name *
                  </label>
                  <input
                    type="text"
                    value={automationConfig.name}
                    onChange={(e) => setAutomationConfig(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Daily Showcase Push for Jordan 1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frequency
                  </label>
                  <select
                    value={automationConfig.frequency}
                    onChange={(e) => setAutomationConfig(prev => ({ 
                      ...prev, 
                      frequency: e.target.value as 'once' | 'daily' | 'weekly' 
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  >
                    <option value="once">One-time</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Push Send Time
                  </label>
                  <input
                    type="time"
                    value={automationConfig.sendTime}
                    onChange={(e) => setAutomationConfig(prev => ({ 
                      ...prev, 
                      sendTime: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                
                {automationConfig.frequency === 'once' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date
                    </label>
                    <input
                      type="date"
                      value={automationConfig.scheduledDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setAutomationConfig(prev => ({ 
                        ...prev, 
                        scheduledDate: e.target.value 
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    />
                  </div>
                )}
              </div>

              {/* Show selected script/template info */}
              {creationType === 'script' && selectedScript && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  {(() => {
                    const script = availableScripts.find(s => s.id === selectedScript);
                    return script ? (
                      <>
                        <h4 className="text-sm font-medium text-blue-800 mb-2">Selected Script: {script.name}</h4>
                        <p className="text-sm text-blue-700 mb-2">{script.description}</p>
                        <p className="text-xs text-blue-600">
                          Will generate {script.audiences?.length || 1} different audiences, each requiring custom push content in the next step.
                        </p>
                      </>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Push Content Creation */}
          {currentStep === 4 && creationType === 'script' && (
            <div className="space-y-6">
              {(() => {
                const script = availableScripts.find(s => s.id === selectedScript);
                if (!script || !script.audiences) return null;
                
                return (
                  <>
                    {/* Audience Progress Header */}
                    <div className="bg-gray-50 rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-800">
                          Push {currentPushIndex + 1} of {script.audiences.length}
                        </h3>
                        <div className="flex space-x-2">
                          {script.audiences.map((_, index) => (
                            <button
                              key={index}
                              onClick={() => setCurrentPushIndex(index)}
                              className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                                index === currentPushIndex
                                  ? 'bg-blue-600 text-white'
                                  : index < currentPushIndex || (pushContents[index]?.title && pushContents[index]?.body)
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                              }`}
                            >
                              {index + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="text-center">
                        <h4 className="font-medium text-gray-800 mb-2">
                          {script.audiences[currentPushIndex]?.name.replace(/_/g, ' ').toUpperCase()}
                        </h4>
                        <p className="text-gray-600">
                          {script.audiences[currentPushIndex]?.description}
                        </p>
                      </div>
                    </div>
                    
                    {/* Push Content Form */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Push Title *
                        </label>
                        <input
                          type="text"
                          value={pushContents[currentPushIndex]?.title || ''}
                          onChange={(e) => updatePushContent('title', e.target.value)}
                          placeholder={`e.g., ${script.audiences[currentPushIndex]?.name === 'haves' ? 'Your sneaker is in demand!' : 
                                              script.audiences[currentPushIndex]?.name === 'wants' ? 'Your wishlist item is available!' :
                                              script.audiences[currentPushIndex]?.name.includes('new') ? 'Welcome to Tradeblock!' :
                                              'New trending sneakers just dropped!'}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Deep Link (optional)
                        </label>
                        <input
                          type="text"
                          value={pushContents[currentPushIndex]?.deepLink || ''}
                          onChange={(e) => updatePushContent('deepLink', e.target.value)}
                          placeholder="app://showcase/haves"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                        />
                      </div>
                      
                      <div className="lg:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Push Body *
                        </label>
                        <textarea
                          value={pushContents[currentPushIndex]?.body || ''}
                          onChange={(e) => updatePushContent('body', e.target.value)}
                          placeholder={`e.g., ${script.audiences[currentPushIndex]?.name === 'haves' ? 'People are making offers on your sneaker. Check it out!' : 
                                               script.audiences[currentPushIndex]?.name === 'wants' ? 'Great news - someone is selling the sneaker you want!' :
                                               script.audiences[currentPushIndex]?.name.includes('new') ? 'Get started with your sneaker trading journey!' :
                                               'Check out the latest trending sneakers everyone is talking about!'}`}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Layer
                        </label>
                        <select
                          value={pushContents[currentPushIndex]?.layerId ?? (pushContents[currentPushIndex]?.audienceName?.includes('level') || pushContents[currentPushIndex]?.audienceName?.includes('new_user') || pushContents[currentPushIndex]?.audienceName?.includes('new_star') ? 5 : 2)}
                          onChange={(e) => updatePushContent('layerId', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                        >
                          <option value={1}>Layer 1 (Platform-Wide)</option>
                          <option value={2}>Layer 2 (Product/Trend)</option>
                          <option value={5}>Layer 5 (New User Series)</option>
                          <option value={3}>Layer 3 (Behavior-Responsive)</option>
                          <option value={4}>Layer 4 (Test)</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* Navigation between pushes */}
                    {script.audiences.length > 1 && (
                      <div className="flex justify-between pt-6 border-t">
                        <Button
                          onClick={() => setCurrentPushIndex(Math.max(0, currentPushIndex - 1))}
                          disabled={currentPushIndex === 0}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          ← Previous Push
                        </Button>
                        <Button
                          onClick={() => setCurrentPushIndex(Math.min(script.audiences.length - 1, currentPushIndex + 1))}
                          disabled={currentPushIndex === script.audiences.length - 1}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          Next Push →
                        </Button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Template content for step 4 */}
          {currentStep === 4 && creationType === 'template' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎯</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Template Ready!</h3>
              <p className="text-gray-600">
                Your template automation is configured and ready to create.
              </p>
            </div>
          )}
        </div>

        {/* Response Message */}
        {response && (
          <div className={`mt-6 p-4 rounded-lg ${
            response.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            <p className={`font-medium ${response.success ? 'text-green-800' : 'text-red-800'}`}>
              {response.message}
            </p>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8">
          <Button
            onClick={currentStep === 1 ? handleCancel : handleBack}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {currentStep === 1 ? 'Cancel' : 'Back'}
          </Button>

          {currentStep < 4 ? (
            <Button
              onClick={handleNext}
              disabled={
                (currentStep === 1 && !creationType) ||
                (currentStep === 2 && !selectedScript && !selectedTemplate) ||
                (currentStep === 3 && !automationConfig.name)
              }
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                (currentStep === 1 && creationType) ||
                (currentStep === 2 && (selectedScript || selectedTemplate)) ||
                (currentStep === 3 && automationConfig.name)
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Next Step
            </Button>
          ) : (
            <div className="flex space-x-3">
              <Button
                onClick={() => handleCreateAutomation(true)} // Save as draft
                disabled={loading || !automationConfig.name}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  !loading && automationConfig.name
                    ? 'bg-gray-600 hover:bg-gray-700 text-white' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {loading ? 'Saving...' : 'Save as Draft'}
              </Button>
              <Button
                onClick={() => handleCreateAutomation(false)} // Create active automation
                disabled={
                  loading ||
                  !automationConfig.name ||
                  (creationType === 'script' && pushContents.some(push => !push.title || !push.body))
                }
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  !loading &&
                  automationConfig.name &&
                  (creationType === 'template' || pushContents.every(push => push.title && push.body))
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {loading ? 'Creating...' : 'Create Automation'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}