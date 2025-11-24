'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/Button';
import { UniversalAutomation } from '@/types/automation';

// Helper function - now just returns send time directly (NO subtraction)
// The leadTimeMinutes offset is handled by buildCronExpression() in automationEngine
function calculateExecutionTime(sendTime: string): string {
  // FIXED: executionTime now stores send time directly
  // The 30-minute automation start offset is handled by leadTimeMinutes in buildCronExpression()
  return sendTime;
}

// Helper function - now just returns executionTime directly (NO addition)
// Since executionTime now stores send time, no conversion needed
function calculateSendTime(executionTime: string): string {
  // FIXED: executionTime now IS the send time, so just return it
  return executionTime;
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
  sequenceOrder: number;
}

export default function EditAutomationPage() {
  const router = useRouter();
  const params = useParams();
  const automationId = params.id as string;
  
  // State management
  const [automation, setAutomation] = useState<UniversalAutomation | null>(null);
  const [availableScripts, setAvailableScripts] = useState<AvailableScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPushIndex, setCurrentPushIndex] = useState(0);
  const [response, setResponse] = useState<{ success: boolean; message: string } | null>(null);

  // Editable configuration
  const [editConfig, setEditConfig] = useState({
    name: '',
    frequency: 'daily' as 'once' | 'daily' | 'weekly',
    scheduledDate: '',
    sendTime: '10:00',
    isActive: true
  });
  
  const [editPushContents, setEditPushContents] = useState<PushContent[]>([]);

  // Enrich push contents with script audience data
  const enrichPushContentsWithScriptData = (pushSequence: any[], scriptData: AvailableScript | null) => {
    return pushSequence.map((push: any, index: number) => {
      const audienceName = push.audienceName || 'default';
      let audienceDescription = 'Default audience';
      
      if (scriptData) {
        // First try to match by exact audience name
        let matchingAudience = scriptData.audiences.find(aud => aud.name === push.audienceName);
        
        // If no exact match, try matching by sequence order (fallback for older automations)
        if (!matchingAudience && scriptData.audiences[index]) {
          matchingAudience = scriptData.audiences[index];
        }
        
        if (matchingAudience) {
          audienceDescription = matchingAudience.description;
        }
      }
      
      return {
        audienceName: audienceName,
        audienceDescription: audienceDescription,
        title: push.title,
        body: push.body,
        deepLink: push.deepLink || '',
        layerId: push.layerId,
        sequenceOrder: push.sequenceOrder
      };
    });
  };

  // Fetch automation details
  const fetchAutomation = async () => {
    try {
      const response = await fetch(`/api/automation/recipes/${automationId}`);
      const result = await response.json();
      if (result.success && result.data) {
        const auto = result.data;
        setAutomation(auto);
        
        // Initialize edit state
        setEditConfig({
          name: auto.name,
          frequency: auto.schedule.frequency,
          scheduledDate: auto.schedule.startDate || '',
          sendTime: calculateSendTime(auto.schedule.executionTime),
          isActive: Boolean(auto.isActive) // Ensure it's always a boolean
        });
        
        // Initialize push contents - will be enriched once scripts are loaded
        const basicPushContents = auto.pushSequence.map((push: any) => ({
          audienceName: push.audienceName || 'default',
          audienceDescription: push.audienceName ? `Audience: ${push.audienceName}` : 'Default audience',
          title: push.title,
          body: push.body,
          deepLink: push.deepLink || '',
          layerId: push.layerId,
          sequenceOrder: push.sequenceOrder
        }));
        setEditPushContents(basicPushContents);
      } else {
        setResponse({
          success: false,
          message: 'Automation not found'
        });
      }
    } catch (error) {
      console.error('Failed to fetch automation:', error);
      setResponse({
        success: false,
        message: 'Failed to load automation details'
      });
    } finally {
      setLoading(false);
    }
  };

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
    if (automationId) {
      fetchAutomation();
      fetchAvailableScripts();
    }
  }, [automationId]);

  // Enrich push contents with script data once both are loaded
  useEffect(() => {
    if (automation && availableScripts.length > 0 && automation.audienceCriteria?.customScript) {
      const currentScript = availableScripts.find(s => s.id === automation.audienceCriteria.customScript!.scriptId);
      if (currentScript) {
        const enrichedContents = enrichPushContentsWithScriptData(automation.pushSequence, currentScript);
        setEditPushContents(enrichedContents);
      }
    }
  }, [automation, availableScripts]);

  // Get current script details
  const getCurrentScript = () => {
    if (!automation?.audienceCriteria?.customScript) return null;
    return availableScripts.find(s => s.id === automation.audienceCriteria.customScript!.scriptId);
  };

  // Update push content
  const updatePushContent = (field: keyof PushContent, value: string | number) => {
    const newContents = [...editPushContents];
    if (newContents[currentPushIndex]) {
      (newContents[currentPushIndex] as any)[field] = value;
      setEditPushContents(newContents);
    }
  };

  // Save changes
  const handleSave = async () => {
    if (!automation || !editConfig.name) {
      setResponse({
        success: false,
        message: 'Please provide an automation name'
      });
      return;
    }

    const incompletePushes = editPushContents.filter(push => !push.title || !push.body);
    if (incompletePushes.length > 0) {
      setResponse({
        success: false,
        message: `Please complete all push notifications (${incompletePushes.length} still need title and body)`
      });
      return;
    }

    setSaving(true);
    try {
      const updatedAutomation: UniversalAutomation = {
        ...automation,
        name: editConfig.name,
        isActive: editConfig.isActive,
        status: editConfig.isActive ? 'active' : 'inactive', // Sync status with isActive
        schedule: {
          ...automation.schedule,
          frequency: editConfig.frequency,
          startDate: editConfig.frequency === 'once' ? editConfig.scheduledDate : automation.schedule.startDate,
          executionTime: calculateExecutionTime(editConfig.sendTime),
        },
        pushSequence: editPushContents.map((push, index) => {
          const existingPush = automation.pushSequence.find(p => p.sequenceOrder === index + 1) || {
            id: '',
            timing: { delayAfterPrevious: 0, sendTime: '' },
            status: 'pending'
          };
          return {
            ...existingPush,
            id: existingPush.id || '',
            automationId: automation.id,
            sequenceOrder: index + 1,
            title: push.title,
            body: push.body,
            deepLink: push.deepLink || '',
            layerId: push.layerId,
            status: existingPush.status || 'pending',
            timing: {
              ...existingPush.timing,
              delayAfterPrevious: index === 0 ? 0 : 5 // Example: static delay
            }
          };
        }),
        updatedAt: new Date().toISOString(),
      };

      const response = await fetch(`/api/automation/recipes/${automationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedAutomation)
      });

      const result = await response.json();
      if (result.success) {
        setResponse({
          success: true,
          message: 'Automation updated successfully!'
        });
        // Refresh automation data
        fetchAutomation();
      } else {
        setResponse({
          success: false,
          message: result.message || 'Failed to update automation'
        });
      }
    } catch (error: any) {
      setResponse({
        success: false,
        message: error.message || 'Failed to update automation'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading automation details...</p>
        </div>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Automation Not Found</h1>
          <p className="text-gray-600 mb-6">The automation you're looking for doesn't exist or has been deleted.</p>
          <Button
            onClick={handleCancel}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const currentScript = getCurrentScript();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Edit Automation</h1>
              <p className="text-gray-600 mt-1">Modify your automation settings and push content</p>
            </div>
            <div className="flex space-x-3">
              <Button
                onClick={handleCancel}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Automation Overview */}
        <div className="bg-white rounded-lg shadow-sm border mb-8">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Automation Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={Boolean(editConfig.isActive)}
                    onChange={(e) => setEditConfig(prev => ({ ...prev, isActive: Boolean(e.target.checked) }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm font-medium ${editConfig.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                    {editConfig.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Created</label>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(automation.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Last Executed</label>
                <p className="text-sm font-medium text-gray-900">
                  {automation.metadata.lastExecutedAt ? new Date(automation.metadata.lastExecutedAt).toLocaleDateString() : 'Never'}
                </p>
              </div>
            </div>
          </div>

          {/* Script Information */}
          {currentScript && (
            <div className="p-6 border-b bg-blue-50">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Script Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Script</label>
                  <p className="text-sm font-medium text-gray-900">{currentScript.name}</p>
                  <p className="text-xs text-gray-600 mt-1">{currentScript.description}</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Audiences Generated</label>
                  <p className="text-sm font-medium text-gray-900">{currentScript.audiences.length} different audiences</p>
                  <div className="mt-1">
                    {currentScript.audiences.map((audience, index) => (
                      <span key={index} className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mr-1 mb-1">
                        {audience.name.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Schedule Configuration */}
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Schedule Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Automation Name *
                </label>
                <input
                  type="text"
                  value={editConfig.name}
                  onChange={(e) => setEditConfig(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frequency
                </label>
                <select
                  value={editConfig.frequency}
                  onChange={(e) => setEditConfig(prev => ({ 
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
                  value={editConfig.sendTime}
                  onChange={(e) => setEditConfig(prev => ({ 
                    ...prev, 
                    sendTime: e.target.value 
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              
              {editConfig.frequency === 'once' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={editConfig.scheduledDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setEditConfig(prev => ({ 
                      ...prev, 
                      scheduledDate: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Push Content Management */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Push Notification Content</h2>
            
            {/* Audience Progress Header */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-800">
                  Push {currentPushIndex + 1} of {editPushContents.length}
                </h3>
                <div className="flex space-x-2">
                  {editPushContents.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentPushIndex(index)}
                      className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                        index === currentPushIndex
                          ? 'bg-blue-600 text-white'
                          : editPushContents[index]?.title && editPushContents[index]?.body
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                      }`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
              {editPushContents[currentPushIndex] && (
                <div className="text-center">
                  <h4 className="font-medium text-gray-800 mb-2">
                    {editPushContents[currentPushIndex].audienceName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </h4>
                  <p className="text-gray-600 text-sm">
                    {editPushContents[currentPushIndex].audienceDescription}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Push Content Form */}
          <div className="p-6">
            {editPushContents[currentPushIndex] && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Push Title *
                  </label>
                  <input
                    type="text"
                    value={editPushContents[currentPushIndex]?.title || ''}
                    onChange={(e) => updatePushContent('title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Deep Link (optional)
                  </label>
                  <input
                    type="text"
                    value={editPushContents[currentPushIndex]?.deepLink || ''}
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
                    value={editPushContents[currentPushIndex]?.body || ''}
                    onChange={(e) => updatePushContent('body', e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Layer
                  </label>
                  <select
                    value={editPushContents[currentPushIndex]?.layerId ?? (editPushContents[currentPushIndex]?.audienceName?.includes('level') || editPushContents[currentPushIndex]?.audienceName?.includes('new_user') || editPushContents[currentPushIndex]?.audienceName?.includes('new_star') ? 5 : 2)}
                    onChange={(e) => updatePushContent('layerId', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  >
                    <option value={1}>Layer 1 (Platform-Wide)</option>
                    <option value={2}>Layer 2 (Product/Trend)</option>
                    <option value={3}>Layer 3 (Behavior-Responsive)</option>
                    <option value={5}>Layer 5 (New User Series)</option>
                    <option value={4}>Layer 4 (Test)</option>
                  </select>
                </div>
              </div>
            )}
            
            {/* Navigation between pushes */}
            {editPushContents.length > 1 && (
              <div className="flex justify-between pt-6 border-t mt-6">
                <Button
                  onClick={() => setCurrentPushIndex(Math.max(0, currentPushIndex - 1))}
                  disabled={currentPushIndex === 0}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  ← Previous Push
                </Button>
                <Button
                  onClick={() => setCurrentPushIndex(Math.min(editPushContents.length - 1, currentPushIndex + 1))}
                  disabled={currentPushIndex === editPushContents.length - 1}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Next Push →
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Save and Cancel Buttons */}
        <div className="flex justify-end space-x-4 mt-8">
          <Button
            onClick={handleCancel}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !editConfig.name}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
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
      </div>
    </div>
  );
}