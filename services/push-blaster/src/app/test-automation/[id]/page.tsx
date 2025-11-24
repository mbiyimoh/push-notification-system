'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/Button';

interface Automation {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  schedule: {
    frequency: 'once' | 'daily' | 'weekly';
    scheduledTime: string;
    scheduledDate?: string;
    timezone: string;
  };
  template?: {
    id?: string;
    name: string;
    category: string;
    isSystemTemplate: boolean;
    config: any;
  };
  pushSequence: Array<{
    sequenceOrder: number;
    title: string;
    body: string;
    deepLink: string;
    layerId: number;
    audienceName: string;
    timing: {
      delayAfterPrevious: number;
      scheduledTime: string;
    };
    status: string;
  }>;
  audienceCriteria?: {
    customScript?: {
      scriptId: string;
      parameters?: any;
    };
  };
}

interface TestLog {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  stage?: string;
}

type TestMode = 'test-dry-run' | 'test-live-send' | 'real-dry-run' | 'test-scheduled-send';

export default function TestAutomationPage() {
  const router = useRouter();
  const params = useParams();
  const automationId = params.id as string;
  
  // State management
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [loading, setLoading] = useState(true);
  const [testRunning, setTestRunning] = useState(false);
  const [selectedTestMode, setSelectedTestMode] = useState<TestMode | null>(null);
  const [testLogs, setTestLogs] = useState<TestLog[]>([]);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [currentEventSource, setCurrentEventSource] = useState<EventSource | null>(null);
  const [isKilling, setIsKilling] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  // Get today's date in CST timezone for proper default
  const getTodayInCST = () => {
    const now = new Date();
    const cst = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}));
    return cst.toISOString().split('T')[0];
  };
  
  const [scheduledDate, setScheduledDate] = useState(getTodayInCST()); // Default to today in CST
  const [scheduledTime, setScheduledTime] = useState('');
  const [scheduledAutomationId, setScheduledAutomationId] = useState<string | null>(null);
  const [isMonitoringScheduled, setIsMonitoringScheduled] = useState(false);

  // Fetch automation details
  const fetchAutomation = async () => {
    try {
      const response = await fetch(`/api/automation/recipes/${automationId}`);
      const result = await response.json();
      if (result.success && result.data) {
        setAutomation(result.data);
      } else {
        console.error('Failed to fetch automation:', result.message);
      }
    } catch (error) {
      console.error('Error fetching automation:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomation();
  }, [automationId]);

  // Monitor scheduled automation execution
  const monitorScheduledExecution = async (scheduledId: string) => {
    setIsMonitoringScheduled(true);
    setTestRunning(true); // Keep the terminal window open
    setTestLogs([{ 
      timestamp: new Date().toISOString(), 
      level: 'info', 
      message: '⏱️ Monitoring scheduled automation execution...', 
      stage: 'MONITOR' 
    }]);

    // TODO: Connect to live execution logs from AutomationEngine
    // DO NOT call immediate test API - that's for manual tests only
    // The AutomationEngine should provide its own logging endpoint
    setTestLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: '📡 Monitoring automation execution via polling...',
      stage: 'EXECUTION'
    }]);
    
    // Continue polling for execution completion
    // (AutomationEngine doesn't have live logging yet)
    const executionPoll = setInterval(async () => {
      try {
        const execResponse = await fetch(`/api/automation/recipes/${scheduledId}`);
        
        if (execResponse.status === 404) {
          console.log(`[MONITOR] Polling for ${scheduledId}, received 404. Still waiting...`);
          return;
        }
        
        if (!execResponse.ok) {
          clearInterval(executionPoll);
          throw new Error(`Polling failed: ${execResponse.statusText}`);
        }
        
        const execResult = await execResponse.json();
        
        if (execResult.success && execResult.data) {
          const status = execResult.data.status;
          if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            clearInterval(executionPoll);
            setTestRunning(false);
            setTestLogs(prev => [...prev, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `✅ Automation finished with status: ${status}`,
              stage: 'COMPLETE'
            }]);
          } else {
            setTestLogs(prev => [...prev, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Polling: Current status is '${status}'`,
              stage: 'EXECUTION'
            }]);
          }
        }
      } catch (error) {
        clearInterval(executionPoll);
        setTestRunning(false);
        console.error('[MONITOR] Error during polling:', error);
      }
    }, 5000); // Poll every 5 seconds

    // Cleanup on component unmount
    return () => {
      clearInterval(executionPoll);
    };
  };

  // Start test execution
  const startTest = async (testMode: TestMode) => {
    if (!automation) return;

    // If it's scheduled send, show scheduling modal instead
    if (testMode === 'test-scheduled-send') {
      setSelectedTestMode(testMode);
      setShowScheduleModal(true);
      return;
    }

    setSelectedTestMode(testMode);
    setTestRunning(true);
    setTestLogs([]);
    setTestResult(null);

    try {
      // Initialize EventSource for real-time logs
      const eventSource = new EventSource(`/api/automation/test/${automationId}?mode=${testMode}`);
      setCurrentEventSource(eventSource);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'log') {
          setTestLogs(prev => [...prev, {
            timestamp: data.timestamp,
            level: data.level,
            message: data.message,
            stage: data.stage
          }]);
        } else if (data.type === 'result') {
          setTestResult({
            success: data.success,
            message: data.message
          });
          setTestRunning(false);
          eventSource.close();
          setCurrentEventSource(null);
        } else if (data.type === 'error') {
          setTestResult({
            success: false,
            message: data.message
          });
          setTestRunning(false);
          eventSource.close();
          setCurrentEventSource(null);
        }
      };

      eventSource.onerror = () => {
        setTestResult({
          success: false,
          message: 'Connection error during test execution'
        });
        setTestRunning(false);
        eventSource.close();
        setCurrentEventSource(null);
      };

    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Failed to start test'
      });
      setTestRunning(false);
      setCurrentEventSource(null);
    }
  };

  // Kill test execution
  const killTest = async () => {
    if (!testRunning) return;

    setIsKilling(true);

    try {
      // Close the EventSource connection
      if (currentEventSource) {
        currentEventSource.close();
        setCurrentEventSource(null);
      }

      // Kill scheduled test if monitoring
      if (scheduledAutomationId && isMonitoringScheduled) {
        try {
          const response = await fetch(`/api/automation/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              automationId: scheduledAutomationId,
              action: 'cancel',
              reason: 'Cancelled by user from test interface'
            })
          });
          
          if (response.ok) {
            setTestLogs(prev => [...prev, {
              timestamp: new Date().toISOString(),
              level: 'warning',
              message: '🛑 Scheduled automation cancelled',
              stage: 'CANCEL'
            }]);
          }
        } catch (error) {
          console.error('Error cancelling scheduled automation:', error);
        }
        
        setScheduledAutomationId(null);
        setIsMonitoringScheduled(false);
      }

      // Make API call to kill the backend process
      const response = await fetch(`/api/automation/test/${automationId}/kill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: selectedTestMode
        })
      });

      const result = await response.json();

      setTestResult({
        success: false,
        message: result.success ? 'Test killed successfully' : `Failed to kill test: ${result.message}`
      });

      setTestLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        level: 'warning',
        message: 'Test execution killed by user',
        stage: 'KILLED'
      }]);

    } catch (error: any) {
      setTestResult({
        success: false,
        message: `Failed to kill test: ${error.message}`
      });
    } finally {
      setTestRunning(false);
      setIsKilling(false);
    }
  };

  // Schedule a test for future execution
  const scheduleTest = async () => {
    console.log('[UI] scheduleTest function triggered.');
    if (!automation || !scheduledDate || !scheduledTime) {
      alert('Please select both date and time for scheduling.');
      console.error('[UI] Missing automation, date, or time.');
      return;
    }

    // Create scheduled datetime in CST
    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    const now = new Date();
    
    if (scheduledDateTime <= now) {
      alert('Scheduled time must be in the future.');
      return;
    }

    // Test mode requires minimum 3-minute lead time for execution
    const minimumLeadTime = 3; // minutes
    const earliestValidTime = new Date(now.getTime() + minimumLeadTime * 60000);
    
    if (scheduledDateTime < earliestValidTime) {
      const formattedEarliestTime = earliestValidTime.toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      alert(`Test automation requires at least ${minimumLeadTime} minutes lead time. Please schedule for ${formattedEarliestTime} CST or later.`);
      return;
    }

    try {
      setTestRunning(true);
      setShowScheduleModal(false);
      setTestLogs([]);
      setTestResult(null);

      // Create a test automation using the existing scheduling infrastructure
      const testAutomationData = {
        name: `TEST SCHEDULED: ${automation.name}`,
        description: `Scheduled test automation for ${scheduledDateTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST`,
        type: 'script_based',
        status: 'scheduled',
        isActive: true,
        schedule: {
          frequency: 'once',
          scheduledTime: scheduledTime,
          scheduledDate: scheduledDate,
          timezone: 'America/Chicago', // CST
          executionTime: scheduledTime,
          startDate: scheduledDate,
          leadTimeMinutes: 3  // Test mode: 3-minute lead time (not 30!)
        },
        template: automation.template,
        pushSequence: automation.pushSequence.map(push => ({
          ...push,
          // Force TEST audience handling
          audienceName: 'TEST'
        })),
        audienceCriteria: {
          ...automation.audienceCriteria,
          // Mark as test mode
          testMode: true
        },
        settings: {
          isTest: true,
          originalAutomationId: automationId
        }
      };

      console.log('[UI] Sending request to POST /api/automation/recipes with payload:', JSON.stringify(testAutomationData, null, 2));

      // Create the scheduled test automation
      const response = await fetch('/api/automation/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testAutomationData)
      });

      const result = await response.json();
      console.log('[UI] Received response from POST /api/automation/recipes:', JSON.stringify(result, null, 2));

      if (result.success) {
        const scheduledId = result.data?.id || result.automation?.id;
        console.log(`[UI] Automation creation SUCCESS. Scheduled ID: ${scheduledId}`);
        setScheduledAutomationId(scheduledId);
        
        setTestLogs([{
          timestamp: new Date().toISOString(),
          level: 'success',
          message: `✅ Test automation scheduled for ${scheduledDateTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST`,
          stage: 'SCHEDULE'
        }]);
        
        // Start monitoring the scheduled automation
        monitorScheduledExecution(scheduledId);
        
        // Reset date and time to today's defaults (don't clear them)
        setScheduledDate(getTodayInCST());
        setScheduledTime('');
      } else {
        console.error('[UI] Automation creation FAILED.', result.message);
        setTestResult({
          success: false,
          message: `Failed to schedule test automation: ${result.message}`
        });
        setTestRunning(false);
      }
      
    } catch (error: any) {
      console.error('[UI] Catastrophic error in scheduleTest function:', error);
      setTestResult({
        success: false,
        message: `Error scheduling test: ${error.message}`
      });
      setTestRunning(false);
    }
    // Removed finally block - don't automatically set testRunning to false
    // because monitorScheduledExecution needs to keep it true
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading automation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Automation Not Found</h1>
            <Button onClick={() => router.push('/')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg">
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const testModes = [
    {
      id: 'test-dry-run' as TestMode,
      title: 'TEST Audiences - Dry Run',
      description: 'Run script to generate CSVs and perform dry run for all pushes using TEST audiences',
      color: 'blue',
      icon: '🧪'
    },
    {
      id: 'test-live-send' as TestMode,
      title: 'TEST Audiences - Live Send',
      description: 'Run script to generate CSVs and send real pushes to you using TEST audiences (single user)',
      color: 'orange',
      icon: '🚀'
    },
    {
      id: 'real-dry-run' as TestMode,
      title: 'Real Audiences - Dry Run',
      description: 'Run script to generate CSVs and perform dry run for all pushes using REAL audiences',
      color: 'purple',
      icon: '⚡'
    },
    {
      id: 'test-scheduled-send' as TestMode,
      title: 'TEST Audiences - Scheduled Send',
      description: 'Schedule a real push test using TEST audiences at a specific future time (CST)',
      color: 'green',
      icon: '🕐'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Test Automation</h1>
              <p className="text-gray-600 mt-2">{automation.name}</p>
            </div>
            <Button 
              onClick={() => router.push('/')}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium"
            >
              Back to Dashboard
            </Button>
          </div>
        </div>

        {/* Automation Overview */}
        <div className="bg-white rounded-lg shadow-sm border mb-8">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Automation Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                  automation.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {automation.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                <p className="text-sm text-gray-900">{automation.schedule.frequency}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Push Sequence</label>
                <p className="text-sm text-gray-900">{automation.pushSequence.length} pushes</p>
              </div>
            </div>
          </div>
        </div>

        {/* Test Mode Selection */}
        {!testRunning && !testResult && (
          <div className="bg-white rounded-lg shadow-sm border mb-8">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Select Test Mode</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {testModes.map((mode) => (
                  <div key={mode.id} className="relative">
                    <button
                      onClick={() => startTest(mode.id)}
                      className={`w-full p-6 rounded-lg border-2 transition-all hover:shadow-md ${
                        mode.color === 'blue' ? 'border-blue-200 hover:border-blue-300 bg-blue-50' :
                        mode.color === 'orange' ? 'border-orange-200 hover:border-orange-300 bg-orange-50' :
                        mode.color === 'purple' ? 'border-purple-200 hover:border-purple-300 bg-purple-50' :
                        'border-green-200 hover:border-green-300 bg-green-50'
                      }`}
                    >
                      <div className="text-3xl mb-3">{mode.icon}</div>
                      <h3 className={`text-lg font-semibold mb-2 ${
                        mode.color === 'blue' ? 'text-blue-900' :
                        mode.color === 'orange' ? 'text-orange-900' :
                        mode.color === 'purple' ? 'text-purple-900' :
                        'text-green-900'
                      }`}>
                        {mode.title}
                      </h3>
                      <p className="text-sm text-gray-600">{mode.description}</p>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Test Execution */}
        {(testRunning || testResult) && (
          <div className="bg-white rounded-lg shadow-sm border mb-8">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Test Execution - {testModes.find(m => m.id === selectedTestMode)?.title}
                </h2>
                {testRunning && (
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm text-blue-600">Running...</span>
                    </div>
                    <Button
                      onClick={killTest}
                      disabled={isKilling}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isKilling ? 'Killing...' : '🛑 Kill Test'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Real-time Logs */}
              <div className="bg-gray-900 rounded-lg p-4 mb-6 h-96 overflow-y-auto">
                <div className="font-mono text-sm space-y-1">
                  {testLogs.map((log, index) => (
                    <div key={index} className={`${
                      log.level === 'error' ? 'text-red-400' :
                      log.level === 'warning' ? 'text-yellow-400' :
                      log.level === 'success' ? 'text-green-400' :
                      'text-gray-300'
                    }`}>
                      <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      {log.stage && <span className="text-blue-400"> [{log.stage}]</span>}
                      <span className="ml-2">{log.message}</span>
                    </div>
                  ))}
                  {testLogs.length === 0 && testRunning && (
                    <div className="text-gray-500">Initializing test execution...</div>
                  )}
                </div>
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`p-4 rounded-lg ${
                  testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center space-x-3">
                    <div className={`text-2xl ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResult.success ? '✅' : '❌'}
                    </div>
                    <div>
                      <p className={`font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                        {testResult.success ? 'Test Completed Successfully' : 'Test Failed'}
                      </p>
                      <p className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                        {testResult.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {testResult && (
                <div className="flex justify-end space-x-4 mt-6">
                  <Button
                    onClick={() => {
                      setTestResult(null);
                      setTestLogs([]);
                      setSelectedTestMode(null);
                    }}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium"
                  >
                    Run Another Test
                  </Button>
                  <Button
                    onClick={() => router.push(`/edit-automation/${automationId}`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
                  >
                    Edit Automation
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Schedule Modal */}
        {showScheduleModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Schedule Test Automation</h2>
              <p className="text-gray-600 mb-4">
                Select when you want the test automation to run. Time is in CST (Central Standard Time).
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  <strong>Test Mode Timeline:</strong><br/>
                  • Test execution starts 3 minutes before send time<br/>
                  • After test pushes, 2-minute cancellation window<br/>
                  • Ends with real audience validation (no actual sends)
                </p>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={getTodayInCST()}
                    max={(() => {
                      const future = new Date();
                      future.setDate(future.getDate() + 30);
                      const cstFuture = new Date(future.toLocaleString("en-US", {timeZone: "America/Chicago"}));
                      return cstFuture.toISOString().split('T')[0];
                    })()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time (CST)</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <Button
                  onClick={() => {
                    setShowScheduleModal(false);
                    setScheduledDate('');
                    setScheduledTime('');
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium"
                >
                  Cancel
                </Button>
                <Button
                  onClick={scheduleTest}
                  disabled={!scheduledDate || !scheduledTime}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Schedule Test
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}