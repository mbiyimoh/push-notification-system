'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Textarea } from '@/components/Textarea';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import Papa from 'papaparse';

interface ServerResponse {
  message: string;
  success?: boolean;
  failedTokens?: string[];
  jobId?: string;
}

interface AudienceResponse {
  success: boolean;
  message: string;
  userCount: number;
  csvData: string;
  audienceDescription: string;
}

const isValidDeepLink = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'tradeblock.us' || parsedUrl.hostname.endsWith('.tradeblock.us');
  } catch {
    return false;
  }
};

export default function Home() {
  const router = useRouter();
  // Push notification form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [deepLink, setDeepLink] = useState('');
  const [manualUserIds, setManualUserIds] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ServerResponse | null>(null);
  const [notificationLayer, setNotificationLayer] = useState<number>(3); // Default to Layer 3
  const [cadenceResponse, setCadenceResponse] = useState<{ excludedCount: number } | null>(null);

  // Audience query state
  const [lastActiveDays, setLastActiveDays] = useState<number | ''>('');
  const [daysSinceLastActiveInactive, setDaysSinceLastActiveInactive] = useState<number | ''>('');
  const [tradedInLastDays, setTradedInLastDays] = useState<number | ''>('');
  const [notTradedInLastDays, setNotTradedInLastDays] = useState<number | ''>('');
  const [minLifetimeTrades, setMinLifetimeTrades] = useState<number | ''>('');
  const [maxLifetimeTrades, setMaxLifetimeTrades] = useState<number | ''>('');
  const [hasTrustedTrader, setHasTrustedTrader] = useState<boolean | null>(null);
  const [isTrustedTraderCandidate, setIsTrustedTraderCandidate] = useState<boolean | null>(null);
  const [joinedAfterDate, setJoinedAfterDate] = useState('');
  
  // Data packs state for query builder
  const [topTargetShoe, setTopTargetShoe] = useState(false);
  const [hottestShoeTraded, setHottestShoeTraded] = useState(false);
  const [hottestShoeTradedLookback, setHottestShoeTradedLookback] = useState<number | ''>(30);
  const [hottestShoeOffers, setHottestShoeOffers] = useState(false);
  const [hottestShoeOffersLookback, setHottestShoeOffersLookback] = useState<number | ''>(7);
  
  // Data packs state for manual audience
  const [manualTopTargetShoe, setManualTopTargetShoe] = useState(false);
  const [manualHottestShoeTraded, setManualHottestShoeTraded] = useState(false);
  const [manualHottestShoeTradedLookback, setManualHottestShoeTradedLookback] = useState<number | ''>(30);
  const [manualHottestShoeOffers, setManualHottestShoeOffers] = useState(false);
  const [manualHottestShoeOffersLookback, setManualHottestShoeOffersLookback] = useState<number | ''>(7);
  
  // CSV column names for variable display
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  
  // Audience query results
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceResponse, setAudienceResponse] = useState<AudienceResponse | null>(null);
  const [generatedCsv, setGeneratedCsv] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<any[] | null>(null);
  const [audienceDescription, setAudienceDescription] = useState('');
  const [csvPreview, setCsvPreview] = useState<any[] | null>(null);

  // For Manual Audience
  const [manualFile, setManualFile] = useState<File | null>(null);
  
  // External file segmentation state
  const [externalFile, setExternalFile] = useState<File | null>(null);
  const [externalCsvData, setExternalCsvData] = useState<string | null>(null);
  const [externalCsvPreview, setExternalCsvPreview] = useState<any[] | null>(null);
  const [externalFileLoading, setExternalFileLoading] = useState(false);

  // Historical data restoration state
  const [restorationFile, setRestorationFile] = useState<File | null>(null);
  const [restorationLoading, setRestorationLoading] = useState(false);
  const [restorationResponse, setRestorationResponse] = useState<any | null>(null);

  // Audience-to-history conversion state
  const [audienceFile, setAudienceFile] = useState<File | null>(null);
  const [audienceToHistoryLoading, setAudienceToHistoryLoading] = useState(false);
  const [audienceToHistoryResponse, setAudienceToHistoryResponse] = useState<any | null>(null);
  const [historyPushTitle, setHistoryPushTitle] = useState('');
  const [historyPushBody, setHistoryPushBody] = useState('');
  const [historyDeepLink, setHistoryDeepLink] = useState('');
  const [historyAudienceDescription, setHistoryAudienceDescription] = useState('');
  const [historySentAt, setHistorySentAt] = useState('');
  const [historyLayerId, setHistoryLayerId] = useState<number>(3);

  // Smart CSV matching state
  const [smartMatchingFile, setSmartMatchingFile] = useState<File | null>(null);
  const [smartMatchingLoading, setSmartMatchingLoading] = useState(false);
  const [matchingLogs, setMatchingLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [smartConversionLoading, setSmartConversionLoading] = useState(false);
  const [smartConversionResponse, setSmartConversionResponse] = useState<any | null>(null);

  // Retroactive deep link update state
  const [deepLinkUpdateLoading, setDeepLinkUpdateLoading] = useState(false);
  const [deepLinkUpdateResponse, setDeepLinkUpdateResponse] = useState<any | null>(null);
  
  // CSV splitting state
  const [splitSegments, setSplitSegments] = useState<number | ''>(2);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'make' | 'track' | 'calendar' | 'automations' | 'restore'>('make');
  
  // Automation state
  const [automations, setAutomations] = useState<any[]>([]);
  const [automationStats, setAutomationStats] = useState({
    active: 0,
    scheduled: 0,
    paused: 0,
    total: 0
  });
  const [showCreateAutomationModal, setShowCreateAutomationModal] = useState(false);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [availableScripts, setAvailableScripts] = useState<any[]>([]);
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [showScriptSelector, setShowScriptSelector] = useState(false);
  const [scriptParameters, setScriptParameters] = useState<Record<string, any>>({});
  const [scriptAutomationStep, setScriptAutomationStep] = useState(1); // 1: script selection, 2: automation config, 3: push content
  const [scriptAutomationConfig, setScriptAutomationConfig] = useState({
    name: '',
    frequency: 'daily' as 'once' | 'daily' | 'weekly',
    scheduledDate: '',
          executionTime: '10:00'
  });
  const [scriptPushContents, setScriptPushContents] = useState<Array<{
    audienceName: string;
    audienceDescription: string;
    title: string;
    body: string;
    deepLink: string;
    layerId: number;
  }>>([]);
  const [currentPushIndex, setCurrentPushIndex] = useState(0);
  
  // Push logs state
  const [pushLogs, setPushLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Scheduling state
  const [pushMode, setPushMode] = useState<'now' | 'schedule'>('now');
  const [savedAudienceCriteria, setSavedAudienceCriteria] = useState<any>(null);
  const [savedAudienceDescription, setSavedAudienceDescription] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  // Calendar state
  const [scheduledPushes, setScheduledPushes] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarView, setCalendarView] = useState<'monthly' | 'weekly'>('monthly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPush, setSelectedPush] = useState<any>(null);
  const [showPushModal, setShowPushModal] = useState(false);
  const [editingPush, setEditingPush] = useState<any>(null);

  // Modal-specific audience state
  const [modalAudienceResponse, setModalAudienceResponse] = useState<AudienceResponse | null>(null);
  const [modalGeneratedCsv, setModalGeneratedCsv] = useState<string | null>(null);
  const [modalCsvPreview, setModalCsvPreview] = useState<any[] | null>(null);
  const [modalAudienceLoading, setModalAudienceLoading] = useState(false);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalResponse, setModalResponse] = useState<ServerResponse | null>(null);
  const [modalIsLoading, setModalIsLoading] = useState(false);
  const [modalTrackingRecord, setModalTrackingRecord] = useState<any>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const csvContent = event.target?.result as string;
        if (csvContent) {
          setCsvColumns(extractCsvColumns(csvContent));
        }
      };
      reader.readAsText(selectedFile);
    }
  };

  const extractCsvColumns = (csvData: string) => {
    if (!csvData.trim()) return [];
    const lines = csvData.trim().split('\n');
    if (lines.length === 0) return [];
    return lines[0].split(',').map(col => col.trim().replace(/"/g, ''));
  };

  const handleSaveAudienceCriteria = () => {
    const filters: any = {};
    if (lastActiveDays !== '') filters.lastActiveDays = lastActiveDays;
    if (daysSinceLastActiveInactive !== '') filters.daysSinceLastActive_inactive = daysSinceLastActiveInactive;
    if (tradedInLastDays !== '') filters.tradedInLastDays = tradedInLastDays;
    if (notTradedInLastDays !== '') filters.notTradedInLastDays = notTradedInLastDays;
    if (minLifetimeTrades !== '') filters.minLifetimeTrades = minLifetimeTrades;
    if (maxLifetimeTrades !== '') filters.maxLifetimeTrades = maxLifetimeTrades;
    if (hasTrustedTrader !== null) filters.hasTrustedTrader = hasTrustedTrader;
    if (isTrustedTraderCandidate !== null) filters.isTrustedTraderCandidate = isTrustedTraderCandidate;
    if (joinedAfterDate) filters.joinedAfterDate = joinedAfterDate;

    const dataPacks: any = {
      topTargetShoe,
      hottestShoeTraded,
      hottestShoeOffers,
    };

    if (hottestShoeTraded && hottestShoeTradedLookback !== '') {
      dataPacks.hottestShoeTradedLookback = hottestShoeTradedLookback;
    }
    if (hottestShoeOffers && hottestShoeOffersLookback !== '') {
      dataPacks.hottestShoeOffersLookback = hottestShoeOffersLookback;
    }

    const criteria = { filters, dataPacks };
    setSavedAudienceCriteria(criteria);
    
    // Generate description for saved criteria
    const desc = generateAudienceDescription(criteria);
    setSavedAudienceDescription(desc);
    
    alert('Audience criteria saved successfully!');
  };

  const handleSaveManualAudienceCriteria = () => {
    if (!manualUserIds.trim()) {
      alert('Please enter user IDs before saving criteria');
      return;
    }

    const userIdsArray = manualUserIds.split(',').map(id => id.trim()).filter(id => id);
    
    const dataPacks: any = {
      topTargetShoe: manualTopTargetShoe,
      hottestShoeTraded: manualHottestShoeTraded,
      hottestShoeOffers: manualHottestShoeOffers
    };

    if (manualHottestShoeTraded && manualHottestShoeTradedLookback !== '') {
      dataPacks.hottestShoeTradedLookback = manualHottestShoeTradedLookback;
    }
    if (manualHottestShoeOffers && manualHottestShoeOffersLookback !== '') {
      dataPacks.hottestShoeOffersLookback = manualHottestShoeOffersLookback;
    }

    const criteria = { manualUserIds: userIdsArray, dataPacks };
    setSavedAudienceCriteria(criteria);
    setSavedAudienceDescription(`Manual audience: ${userIdsArray.length} specified user(s)`);
    
    alert('Manual audience criteria saved successfully!');
  };

  const generateAudienceDescription = (criteria: any) => {
    const parts = [];
    const { filters, dataPacks } = criteria;
    
    if (filters?.lastActiveDays) parts.push(`active in last ${filters.lastActiveDays} days`);
    if (filters?.tradedInLastDays) parts.push(`traded in last ${filters.tradedInLastDays} days`);
    if (filters?.minLifetimeTrades) parts.push(`min ${filters.minLifetimeTrades} lifetime trades`);
    if (filters?.hasTrustedTrader === true) parts.push('trusted traders');
    if (filters?.hasTrustedTrader === false) parts.push('non-trusted traders');
    
    const dataPackParts = [];
    if (dataPacks?.topTargetShoe) dataPackParts.push('TOP TARGET SHOE');
    if (dataPacks?.hottestShoeTraded) dataPackParts.push('HOTTEST SHOE TRADED');
    if (dataPacks?.hottestShoeOffers) dataPackParts.push('HOTTEST SHOE OFFERS');
    
    let description = parts.length > 0 ? `Users with ${parts.join(', ')}` : 'All users';
    if (dataPackParts.length > 0) {
      description += ` + data packs: ${dataPackParts.join(', ')}`;
    }
    
    return description;
  };

  const handleGenerateAudience = async () => {
    setAudienceLoading(true);
    setAudienceResponse(null);

    try {
      const filters: any = {};
      if (lastActiveDays !== '') filters.lastActiveDays = lastActiveDays;
      if (daysSinceLastActiveInactive !== '') filters.daysSinceLastActive_inactive = daysSinceLastActiveInactive;
      if (tradedInLastDays !== '') filters.tradedInLastDays = tradedInLastDays;
      if (notTradedInLastDays !== '') filters.notTradedInLastDays = notTradedInLastDays;
      if (minLifetimeTrades !== '') filters.minLifetimeTrades = minLifetimeTrades;
      if (maxLifetimeTrades !== '') filters.maxLifetimeTrades = maxLifetimeTrades;
      if (hasTrustedTrader !== null) filters.hasTrustedTrader = hasTrustedTrader;
      if (isTrustedTraderCandidate !== null) filters.isTrustedTraderCandidate = isTrustedTraderCandidate;
      if (joinedAfterDate) filters.joinedAfterDate = joinedAfterDate;

      const dataPacks: any = {
        topTargetShoe,
        hottestShoeTraded,
        hottestShoeOffers,
      };

      if (hottestShoeTraded && hottestShoeTradedLookback !== '') {
        dataPacks.hottestShoeTradedLookback = hottestShoeTradedLookback;
      }
      if (hottestShoeOffers && hottestShoeOffersLookback !== '') {
        dataPacks.hottestShoeOffersLookback = hottestShoeOffersLookback;
      }

      const res = await fetch('/api/query-audience', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...filters,
          dataPacks
        }),
      });

      const data: AudienceResponse = await res.json();
      setAudienceResponse(data);
      
      if (data.success && data.csvData) {
        setGeneratedCsv(data.csvData);
        setCsvColumns(extractCsvColumns(data.csvData));
        Papa.parse(data.csvData, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setCsvPreview(results.data.slice(0, 4));
          },
        });
      }
    } catch (error: any) {
      setAudienceResponse({ 
        success: false, 
        message: error.message || 'An unexpected error occurred.',
        userCount: 0,
        csvData: '',
        audienceDescription: ''
      });
    } finally {
      setAudienceLoading(false);
    }
  };

  const handleGenerateManualAudience = async () => {
    if (!manualUserIds.trim()) {
      alert('Please enter user IDs');
      return;
    }

    setAudienceLoading(true);
    setAudienceResponse(null);

    try {
      const userIdsArray = manualUserIds.split(',').map(id => id.trim()).filter(id => id);
      
      const dataPacks: any = {
        topTargetShoe: manualTopTargetShoe,
        hottestShoeTraded: manualHottestShoeTraded,
        hottestShoeOffers: manualHottestShoeOffers
      };

      if (manualHottestShoeTraded && manualHottestShoeTradedLookback !== '') {
        dataPacks.hottestShoeTradedLookback = manualHottestShoeTradedLookback;
      }
      if (manualHottestShoeOffers && manualHottestShoeOffersLookback !== '') {
        dataPacks.hottestShoeOffersLookback = manualHottestShoeOffersLookback;
      }

      const res = await fetch('/api/query-audience', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          manualUserIds: userIdsArray,
          dataPacks
        }),
      });

      const data: AudienceResponse = await res.json();
      setAudienceResponse(data);
      
      if (data.success && data.csvData) {
        setGeneratedCsv(data.csvData);
        setCsvColumns(extractCsvColumns(data.csvData));
        Papa.parse(data.csvData, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setCsvPreview(results.data.slice(0, 4));
          },
        });
      }
    } catch (error: any) {
      setAudienceResponse({ 
        success: false, 
        message: error.message || 'An unexpected error occurred.',
        userCount: 0,
        csvData: '',
        audienceDescription: ''
      });
    } finally {
      setAudienceLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!generatedCsv) return;
    
    const blob = new Blob([generatedCsv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `audience_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const useGeneratedCsv = () => {
    if (!generatedCsv) return;
    
    const blob = new Blob([generatedCsv], { type: 'text/csv' });
    const csvFile = new File([blob], 'generated_audience.csv', { type: 'text/csv' });
    
    setFile(csvFile);
  };

  const handleSplitAndDownload = async () => {
    if (!generatedCsv || !splitSegments) return;

    const numSegments = Number(splitSegments);
    if (isNaN(numSegments) || numSegments < 1 || numSegments > 20) {
      alert('Please enter a number of segments between 1 and 20.');
      return;
    }

    setAudienceLoading(true);

    try {
      const res = await fetch('/api/query-audience', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvData: generatedCsv,
          splitCount: numSegments,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to generate zip file.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `audience_segments_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setAudienceLoading(false);
    }
  };

  const handleExternalFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      alert('Please upload a CSV file.');
      return;
    }

    setExternalFile(selectedFile);
    setExternalFileLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target?.result as string;
      setExternalCsvData(csvText);

      // Parse CSV for preview
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          setExternalCsvPreview(results.data.slice(0, 4));
          setExternalFileLoading(false);
        },
        error: () => {
          alert('Error parsing CSV file. Please check the format.');
          setExternalFileLoading(false);
        }
      });
    };
    reader.readAsText(selectedFile);
  };

  const handleExternalFileSplit = async () => {
    if (!externalCsvData || !splitSegments) return;

    const numSegments = Number(splitSegments);
    if (isNaN(numSegments) || numSegments < 1 || numSegments > 20) {
      alert('Please enter a number of segments between 1 and 20.');
      return;
    }

    setExternalFileLoading(true);

    try {
      const res = await fetch('/api/query-audience', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvData: externalCsvData,
          splitCount: numSegments,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to generate zip file.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `external_audience_segments_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setExternalFileLoading(false);
    }
  };

  const handleRestorationFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setRestorationFile(file);
      setRestorationResponse(null);
    }
  };

  const handleRestoreHistoricalData = async () => {
    if (!restorationFile) {
      alert('Please select a CSV file first');
      return;
    }

    setRestorationLoading(true);
    setRestorationResponse(null);

    try {
      const formData = new FormData();
      formData.append('file', restorationFile);

      const response = await fetch('http://localhost:3002/api/restore-historical-data', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setRestorationResponse(data);

      if (data.success) {
        // Clear the file after successful upload
        setRestorationFile(null);
        const fileInput = document.getElementById('restoration-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      }
    } catch (error: any) {
      setRestorationResponse({
        success: false,
        error: 'Failed to restore historical data',
        details: error.message
      });
    } finally {
      setRestorationLoading(false);
    }
  };

  const handleAudienceFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudienceFile(file);
      setAudienceToHistoryResponse(null);
    }
  };

  const handleConvertAudienceToHistory = async () => {
    if (!audienceFile) {
      alert('Please select an audience CSV file first');
      return;
    }

    if (!historyPushTitle || !historyAudienceDescription || !historySentAt) {
      alert('Please fill in the push title, audience description, and sent at timestamp');
      return;
    }

    setAudienceToHistoryLoading(true);
    setAudienceToHistoryResponse(null);

    try {
      const formData = new FormData();
      formData.append('audienceFile', audienceFile);
      formData.append('layerId', String(historyLayerId));
      formData.append('pushTitle', historyPushTitle);
      formData.append('pushBody', historyPushBody);
      formData.append('deepLink', historyDeepLink);
      formData.append('audienceDescription', historyAudienceDescription);
      formData.append('sentAt', historySentAt);

      const response = await fetch('http://localhost:3002/api/convert-audience-to-history', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setAudienceToHistoryResponse(data);

      if (data.success) {
        // Clear the form after successful conversion
        setAudienceFile(null);
        setHistoryPushTitle('');
        setHistoryPushBody('');
        setHistoryDeepLink('');
        setHistoryAudienceDescription('');
        setHistorySentAt('');
        setHistoryLayerId(3);
        const fileInput = document.getElementById('audience-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      }
    } catch (error: any) {
      setAudienceToHistoryResponse({
        success: false,
        error: 'Failed to convert audience to historical data',
        details: error.message
      });
    } finally {
      setAudienceToHistoryLoading(false);
    }
  };

  const handleSmartMatchingFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSmartMatchingFile(file);
    setMatchingLogs([]);
    setSelectedLog(null);
    setSmartConversionResponse(null);
    setSmartMatchingLoading(true);

    try {
      // Parse CSV to get audience size
      const csvText = await file.text();
      const lines = csvText.trim().split('\n');
      const audienceSize = Math.max(0, lines.length - 1); // Subtract header

      // Get Track Results logs
      const logsResponse = await fetch('/api/push-logs');
      const logsData = await logsResponse.json();
      
      if (!logsData.success) {
        throw new Error('Failed to fetch Track Results logs');
      }

      // Find matching logs
      const matchResponse = await fetch('http://localhost:3002/api/find-matching-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvAudienceSize: audienceSize,
          trackResultsLogs: logsData.logs
        })
      });

      if (!matchResponse.ok) {
        throw new Error(`HTTP ${matchResponse.status}: ${matchResponse.statusText}`);
      }

      const matchData = await matchResponse.json();
      
      if (matchData.success) {
        setMatchingLogs(matchData.matchingLogs);
      } else {
        throw new Error(matchData.error || 'Failed to find matching logs');
      }

    } catch (error: any) {
      alert(`Error processing file: ${error.message}`);
    } finally {
      setSmartMatchingLoading(false);
    }
  };

  const handleSmartConversion = async () => {
    if (!smartMatchingFile || !selectedLog) {
      alert('Please select a CSV file and choose a matching log');
      return;
    }

    setSmartConversionLoading(true);
    setSmartConversionResponse(null);

    try {
      const formData = new FormData();
      formData.append('audienceFile', smartMatchingFile);
      formData.append('layerId', String(selectedLog.layerId || 3));
      formData.append('pushTitle', selectedLog.title);
      formData.append('pushBody', selectedLog.body);
      formData.append('deepLink', selectedLog.deepLink || '');
      formData.append('audienceDescription', selectedLog.audienceDescription);
      formData.append('sentAt', selectedLog.timestamp);

      const response = await fetch('http://localhost:3002/api/convert-audience-to-history', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setSmartConversionResponse(data);

      if (data.success) {
        // Clear the form after successful conversion
        setSmartMatchingFile(null);
        setMatchingLogs([]);
        setSelectedLog(null);
        const fileInput = document.getElementById('smart-matching-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      }
    } catch (error: any) {
      setSmartConversionResponse({
        success: false,
        error: 'Failed to convert with smart matching',
        details: error.message
      });
    } finally {
      setSmartConversionLoading(false);
    }
  };

  const handleRetroactiveDeepLinkUpdate = async () => {
    setDeepLinkUpdateLoading(true);
    setDeepLinkUpdateResponse(null);

    try {
      // Get Track Results logs
      const logsResponse = await fetch('/api/push-logs');
      const logsData = await logsResponse.json();
      
      if (!logsData.success) {
        throw new Error('Failed to fetch Track Results logs');
      }

      // Update existing records with deep links
      const updateResponse = await fetch('http://localhost:3002/api/update-deep-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackResultsLogs: logsData.logs
        })
      });

      if (!updateResponse.ok) {
        throw new Error(`HTTP ${updateResponse.status}: ${updateResponse.statusText}`);
      }

      const updateData = await updateResponse.json();
      setDeepLinkUpdateResponse(updateData);

    } catch (error: any) {
      console.error('Deep link update error:', error);
      setDeepLinkUpdateResponse({
        success: false,
        error: 'Failed to update deep links',
        details: error.message
      });
    } finally {
      setDeepLinkUpdateLoading(false);
    }
  };

  const fetchPushLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/push-logs');
      const data = await res.json();
      if (data.success) {
        setPushLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchAvailableScripts = async () => {
    try {
      const response = await fetch('/api/scripts');
      const data = await response.json();
      
      if (data.success) {
        setAvailableScripts(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch available scripts:', error);
    }
  };

  const fetchAutomations = async () => {
    setAutomationLoading(true);
    try {
      const response = await fetch('/api/automation/recipes');
      const data = await response.json();
      
      if (data.success) {
        setAutomations(data.data || []);
        
        // Calculate stats
        const stats = {
          active: data.data?.filter((a: any) => a.status === 'active').length || 0,
          scheduled: data.data?.filter((a: any) => a.status === 'scheduled').length || 0,
          paused: data.data?.filter((a: any) => a.status === 'paused').length || 0,
          total: data.data?.length || 0
        };
        setAutomationStats(stats);
      }
    } catch (error) {
      console.error('Failed to fetch automations:', error);
    } finally {
      setAutomationLoading(false);
    }
  };

  const handleCreateAutomation = () => {
    router.push('/create-automation');
  };

  const handleDeleteAutomation = async (automationId: string, automationName: string) => {
    if (!confirm(`Are you sure you want to delete "${automationName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/automation/recipes/${automationId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      if (result.success) {
        setResponse({
          success: true,
          message: `"${automationName}" deleted successfully!`
        });
        fetchAutomations(); // Refresh the list
      } else {
        setResponse({
          success: false,
          message: result.message || 'Failed to delete automation'
        });
      }
    } catch (error: any) {
      setResponse({
        success: false,
        message: error.message || 'Failed to delete automation'
      });
    }
  };

  const handleUseTemplate = async (templateType: 'onboarding' | 'retention' | 'feature') => {
    try {
      // Map template types to their IDs
      const templateIdMap = {
        'onboarding': 'onboarding_funnel',
        'retention': 'retention_campaign', 
        'feature': 'feature_announcement'
      };

      const templateId = templateIdMap[templateType];
      const variables = getTemplateVariables(templateType);

      // Create automation from template
      const createResponse = await fetch('/api/automation/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId,
          name: `${templateType.charAt(0).toUpperCase() + templateType.slice(1)} Automation - ${new Date().toLocaleDateString()}`,
          variables
        }),
      });
      
      const createData = await createResponse.json();
      
      if (createData.success) {
        setResponse({
          success: true,
          message: `${createData.data.automation.name} created successfully! Check the Automations tab to configure and activate it.`
        });
        fetchAutomations(); // Refresh the list
      } else {
        setResponse({
          success: false,
          message: createData.message || 'Failed to create automation from template'
        });
      }
    } catch (error: any) {
      setResponse({
        success: false,
        message: error.message || 'Failed to create automation from template'
      });
    }
  };

  const initializePushContents = (script: any) => {
    const pushContents = script.audiences.map((audience: any) => ({
      audienceName: audience.name,
      audienceDescription: audience.description,
      title: `New ${audience.name} update`,
      body: `Check out the latest updates for ${audience.description.toLowerCase()}`,
      deepLink: '',
      layerId: 2
    }));
    setScriptPushContents(pushContents);
    setCurrentPushIndex(0);
  };

  const handleCreateScriptAutomation = async () => {
    if (!selectedScript) {
      setResponse({
        success: false,
        message: 'Please select a script first'
      });
      return;
    }

    // Validate required fields
    if (!scriptAutomationConfig.name) {
      setResponse({
        success: false,
        message: 'Please provide an automation name'
      });
      return;
    }

    // Validate all push contents
    const incompletePushes = scriptPushContents.filter(push => !push.title || !push.body);
    if (incompletePushes.length > 0) {
      setResponse({
        success: false,
        message: `Please complete all push notifications (${incompletePushes.length} still need title and body)`
      });
      return;
    }

    try {
      const script = availableScripts.find(s => s.id === selectedScript);
      if (!script) {
        throw new Error('Selected script not found');
      }

      // Determine schedule based on frequency
      let startDate = new Date().toISOString();
      if (scriptAutomationConfig.frequency === 'once' && scriptAutomationConfig.scheduledDate) {
        startDate = new Date(scriptAutomationConfig.scheduledDate).toISOString();
      }

      // Create a script-based automation
      const automationRecipe = {
        name: scriptAutomationConfig.name,
        description: `Script-based automation using ${script.name}`,
        type: scriptAutomationConfig.frequency === 'once' ? 'single_push' : 'recurring',
        status: 'draft',
        schedule: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          frequency: scriptAutomationConfig.frequency,
          startDate: startDate,
                      executionTime: scriptAutomationConfig.executionTime,
          leadTimeMinutes: 30
        },
        template: {
          id: 'script_based_automation',
          name: 'Script-Based Automation',
          category: 'custom',
          isSystemTemplate: false,
          config: {}
        },
        pushSequence: scriptPushContents.map((pushContent, index) => ({
          sequenceOrder: index + 1,
          title: pushContent.title,
          body: pushContent.body,
          deepLink: pushContent.deepLink || '',
          layerId: pushContent.layerId,
          audienceName: pushContent.audienceName, // Add audience mapping
          timing: {
            delayAfterPrevious: index === 0 ? 0 : 5, // First push immediate, others 5 minutes apart
            scheduledTime: scriptAutomationConfig.executionTime
          },
          status: 'pending'
        })),
        audienceCriteria: {
          trustedTraderStatus: 'any',
          trustedTraderCandidate: 'any',
          activityDays: 30,
          tradingDays: 30,
          minTrades: 0,
          dataPacks: [],
          customScript: {
            scriptId: selectedScript,
            scriptName: script.name,
            parameters: scriptParameters
          }
        },
        settings: {
          testUserIds: [],
          emergencyStopEnabled: true,
          dryRunFirst: false,
          cancellationWindowMinutes: 25,
          safeguards: {
            maxAudienceSize: 50000,
            requireConfirmation: false,
            blockOverlapHours: 24
          }
        },
        metadata: {
          createdBy: 'script_ui',
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0
        }
      };

      const response = await fetch('/api/automation/recipes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(automationRecipe),
      });

      const result = await response.json();

      if (result.success) {
        setResponse({
          success: true,
          message: `"${scriptAutomationConfig.name}" automation created successfully!`
        });
        setShowCreateAutomationModal(false);
        setSelectedScript('');
        setScriptParameters({});
        setScriptAutomationStep(1);
        setScriptPushContents([]);
        setCurrentPushIndex(0);
        fetchAutomations(); // Refresh the list
      } else {
        setResponse({
          success: false,
          message: result.message || 'Failed to create script automation'
        });
      }

    } catch (error: any) {
      setResponse({
        success: false,
        message: error.message || 'Failed to create script automation'
      });
    }
  };

  const getTemplateVariables = (templateType: string) => {
    switch (templateType) {
      case 'onboarding':
        return {
          user_segment: 'new_users',
          delay_hours: 24,
          personalization_level: 'basic'
        };
      case 'retention':
        return {
          inactivity_days: 30,
          incentive_type: 'feature_highlight'
        };
      case 'feature':
        return {
          feature_name: 'New Feature',
          target_segment: 'all_users',
          urgency_level: 'normal'
        };
      default:
        return {};
    }
  };

  const fetchScheduledPushes = async () => {
    setCalendarLoading(true);
    try {
      const res = await fetch('/api/scheduled-pushes');
      const data = await res.json();
      if (data.success) {
        setScheduledPushes(data.scheduledPushes);
      }
    } catch (error) {
      console.error('Failed to fetch scheduled pushes:', error);
    } finally {
      setCalendarLoading(false);
    }
  };

  const handlePushClick = (push: any) => {
    setSelectedPush(push);
    setEditingPush({
      title: push.title,
      body: push.body,
      deepLinkUrl: push.deepLinkUrl || ''
    });
    
    // Clear modal-specific state when opening
    setModalResponse(null);
    setModalAudienceResponse(null);
    setModalGeneratedCsv(null);
    setModalFile(null);
    
    // If push status is 'sent', we should show tracking record instead of edit interface
    if (push.status === 'sent') {
      // For sent pushes, we'll need to fetch the actual tracking record
      // For now, create a basic tracking record structure
      setModalTrackingRecord({
        id: push.id,
        timestamp: push.createdAt,
        status: 'completed',
        title: push.title,
        body: push.body,
        deepLink: push.deepLinkUrl || undefined,
        audienceDescription: push.audienceDescription,
        audienceSize: 0, // Would need to be stored when sent
        isDryRun: false,
        successCount: 0,
        totalCount: 0
      });
    } else {
      setModalTrackingRecord(null);
    }
    
    setShowPushModal(true);
  };

  const handleSavePushChanges = async () => {
    if (!selectedPush || !editingPush) return;

    setModalIsLoading(true);
    setModalResponse(null);
    try {
      const res = await fetch(`/api/scheduled-pushes/${selectedPush.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingPush),
      });

      const data = await res.json();
      if (data.success) {
        // Update the scheduled pushes list
        setScheduledPushes(prev => 
          prev.map(push => 
            push.id === selectedPush.id 
              ? { ...push, ...editingPush }
              : push
          )
        );
        setModalResponse({ success: true, message: 'Push updated successfully!' });
      } else {
        setModalResponse({ success: false, message: data.message || 'Failed to update push.' });
      }
    } catch (error: any) {
      setModalResponse({ success: false, message: error.message || 'An unexpected error occurred.' });
    } finally {
      setModalIsLoading(false);
    }
  };

  const handleGenerateModalAudience = async () => {
    if (!selectedPush?.audienceCriteria) return;

    setModalAudienceLoading(true);
    setModalAudienceResponse(null);

    try {
      const criteria = selectedPush.audienceCriteria;
      
      const requestBody: any = {
        ...criteria.filters,
        dataPacks: criteria.dataPacks
      };

      if (criteria.manualUserIds) {
        requestBody.manualUserIds = criteria.manualUserIds;
      }

      const res = await fetch('/api/query-audience', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data: AudienceResponse = await res.json();
      setModalAudienceResponse(data);
      
      if (data.success && data.csvData) {
        setModalGeneratedCsv(data.csvData);
        Papa.parse(data.csvData, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setModalCsvPreview(results.data.slice(0, 4));
          },
        });
      }
    } catch (error: any) {
      setModalAudienceResponse({ 
        success: false, 
        message: error.message || 'An unexpected error occurred.',
        userCount: 0,
        csvData: '',
        audienceDescription: ''
      });
    } finally {
      setModalAudienceLoading(false);
    }
  };

  const downloadModalCsv = () => {
    if (!modalGeneratedCsv) return;
    
    const blob = new Blob([modalGeneratedCsv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `audience_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const useModalGeneratedCsv = () => {
    if (!modalGeneratedCsv) return;
    
    const blob = new Blob([modalGeneratedCsv], { type: 'text/csv' });
    const csvFile = new File([blob], 'generated_audience.csv', { type: 'text/csv' });
    
    setModalFile(csvFile);
  };

  const handleModalFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setModalFile(selectedFile);
    }
  };

  const handleModalSendPush = async (isDryRun: boolean = false) => {
    if (!modalFile || !editingPush?.title || !editingPush?.body) {
      setModalResponse({ message: 'Please fill out the title, body, and ensure a CSV file is available.' });
      return;
    }

    if (editingPush.deepLinkUrl && !isValidDeepLink(editingPush.deepLinkUrl)) {
      setModalResponse({ message: 'Deep link must be a valid tradeblock.us URL.' });
      return;
    }

    setModalIsLoading(true);
    setModalResponse(null);

    const formData = new FormData();
    formData.append('title', editingPush.title);
    formData.append('body', editingPush.body);
    if (editingPush.deepLinkUrl) {
      formData.append('deepLink', editingPush.deepLinkUrl);
    }
    formData.append('file', modalFile);

    try {
      const url = isDryRun ? '/api/send-push?dryRun=true' : '/api/send-push';
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      const data: ServerResponse = await res.json();
      setModalResponse(data);

      // If successful and not a dry run, update push status and create tracking record
      if (data.success && !isDryRun) {
        try {
          // Update the scheduled push status to 'sent'
          await fetch(`/api/scheduled-pushes/${selectedPush.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'sent' }),
          });

          // Update local scheduled pushes state
          setScheduledPushes(prev => 
            prev.map(push => 
              push.id === selectedPush.id 
                ? { ...push, status: 'sent' }
                : push
            )
          );

          // Create tracking record for modal display
          const trackingRecord = {
            id: data.jobId,
            timestamp: new Date().toISOString(),
            status: 'completed',
            title: editingPush.title,
            body: editingPush.body,
            deepLink: editingPush.deepLinkUrl || undefined,
            audienceDescription: selectedPush.audienceDescription,
            audienceSize: modalAudienceResponse?.userCount || 0,
            isDryRun: false,
            successCount: modalAudienceResponse?.userCount || 0,
            totalCount: modalAudienceResponse?.userCount || 0
          };

          setModalTrackingRecord(trackingRecord);
        } catch (error) {
          console.error('Failed to update push status:', error);
        }
      }
    } catch (error: any) {
      setModalResponse({ message: error.message || 'An unexpected error occurred.' });
    } finally {
      setModalIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setResponse(null);

    if (!file || !title || !body) {
      setResponse({ message: 'Please fill out the title, body, and upload a CSV file.' });
      setIsLoading(false);
      return;
    }

    if (deepLink && !isValidDeepLink(deepLink)) {
      setResponse({ message: 'Deep link must be a valid tradeblock.us URL (e.g., https://tradeblock.us/...)' });
      setIsLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('body', body);
    if (deepLink) {
      formData.append('deepLink', deepLink);
    }
    formData.append('file', file);
    formData.append('layerId', String(notificationLayer));

    try {
      const res = await fetch('/api/send-push', {
        method: 'POST',
        body: formData,
      });
      const data: ServerResponse = await res.json();
      setResponse(data);
    } catch (error: any) {
      setResponse({ message: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDryRun = async () => {
    setIsLoading(true);
    setResponse(null);

    if (!file || !title || !body) {
      setResponse({ message: 'Please fill out the title, body, and upload a CSV file for a dry run.' });
      setIsLoading(false);
      return;
    }

    if (deepLink && !isValidDeepLink(deepLink)) {
      setResponse({ message: 'Deep link must be a valid tradeblock.us URL.' });
      setIsLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('body', body);
    if (deepLink) {
      formData.append('deepLink', deepLink);
    }
    formData.append('file', file);
    formData.append('layerId', String(notificationLayer));

    try {
      const res = await fetch('/api/send-push?dryRun=true', {
        method: 'POST',
        body: formData,
      });
      const data: ServerResponse = await res.json();
      setResponse(data);
    } catch (error: any) {
      setResponse({ message: error.message || 'An unexpected error occurred during dry run.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleScheduleClick = () => {
    if (!savedAudienceCriteria) {
      alert('Please save audience criteria first using the "Save Audience Criteria" button in one of the audience sections above.');
      return;
    }

    if (!title || !body) {
      alert('Please fill out the notification title and body before scheduling.');
      return;
    }

    setShowScheduleModal(true);
  };

  const handleScheduleSubmit = async () => {
    if (!scheduledDate || !scheduledTime) {
      alert('Please select both date and time for scheduling.');
      return;
    }

    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    
    if (scheduledDateTime <= new Date()) {
      alert('Scheduled time must be in the future.');
      return;
    }

    setIsLoading(true);

    try {
      // Create UniversalAutomation recipe for scheduled push
      const automationRecipe = {
        name: `Scheduled Push: ${title}`,
        description: `Scheduled push notification for ${scheduledDateTime.toLocaleString()}`,
        type: 'single_push',
        status: 'scheduled',
        schedule: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          frequency: 'once',
          startDate: scheduledDateTime.toISOString(),
          executionTime: scheduledTime,
          leadTimeMinutes: 30
        },
        template: {
          id: 'manual_scheduled_push',
          name: 'Manual Scheduled Push',
          category: 'manual',
          isSystemTemplate: false,
          config: {}
        },
        pushSequence: [{
          sequenceOrder: 1,
          title,
          body,
          deepLink: deepLink || '',
          layerId: notificationLayer,
          timing: {
            delayAfterPrevious: 0,
            executionTime: scheduledTime
          },
          status: 'pending'
        }],
        audienceCriteria: savedAudienceCriteria || {
          trustedTraderStatus: 'any',
          trustedTraderCandidate: 'any',
          activityDays: 30,
          tradingDays: 30,
          minTrades: 0,
          dataPacks: []
        },
        settings: {
          testUserIds: [],
          emergencyStopEnabled: true,
          dryRunFirst: false,
          cancellationWindowMinutes: 25,
          safeguards: {
            maxAudienceSize: 50000,
            requireConfirmation: false,
            blockOverlapHours: 24
          }
        },
        metadata: {
          createdBy: 'manual_ui',
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0
        }
      };

      const response = await fetch('/api/automation/recipes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(automationRecipe),
      });

      const data = await response.json();
      
      if (data.success) {
        setResponse({ 
          success: true, 
          message: `Push notification scheduled successfully for ${scheduledDateTime.toLocaleString()}! Created automation: ${data.data.name}` 
        });
        setShowScheduleModal(false);
        setScheduledDate('');
        setScheduledTime('');
        // Clear form
        setTitle('');
        setBody('');
        setDeepLink('');
        setSavedAudienceCriteria(null);
        setSavedAudienceDescription('');
      } else {
        setResponse({ 
          success: false, 
          message: data.message || 'Failed to schedule push notification.' 
        });
      }
    } catch (error: any) {
      setResponse({ 
        success: false, 
        message: error.message || 'An unexpected error occurred while scheduling.' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusInfo = (log: any) => {
    if (log.isDryRun) {
      return {
        text: 'DRY RUN',
        className: 'bg-yellow-100 text-yellow-800',
      };
    }
    switch (log.status) {
      case 'completed':
        return { text: 'COMPLETED', className: 'bg-green-100 text-green-800' };
      case 'failed':
        return { text: 'FAILED', className: 'bg-red-100 text-red-800' };
      case 'in_progress':
        return { text: 'IN PROGRESS', className: 'bg-blue-100 text-blue-800' };
      default:
        return { text: (log.status || 'UNKNOWN').toUpperCase(), className: 'bg-gray-100 text-gray-800' };
    }
  };

  const truncateUrl = (url: string, maxLength: number = 99) => {
    if (url.length <= maxLength) return url;
    
    // Smart truncation: show beginning and end
    const startChars = Math.floor((maxLength - 3) * 0.6); // 60% for start
    const endChars = Math.floor((maxLength - 3) * 0.4);   // 40% for end
    
    return `${url.substring(0, startChars)}...${url.substring(url.length - endChars)}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('URL copied to clipboard!');
  };

  // Calendar utility functions
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  };

  const getPushesForDate = (date: Date) => {
    return scheduledPushes.filter(push => {
      const pushDate = new Date(push.scheduledFor);
      return isSameDay(pushDate, date);
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setDate(prev.getDate() - 7);
      } else {
        newDate.setDate(prev.getDate() + 7);
      }
      return newDate;
    });
  };

  const getWeekDays = (date: Date) => {
    const week = [];
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      week.push(day);
    }
    return week;
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
      <div className="w-full max-w-6xl mx-auto">
        {/* Enhanced Header */}
        <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-40">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">PB</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                    Push Blaster
                  </h1>
                  <p className="text-sm text-slate-500">Push Notification Management</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  System Online
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Container */}
        <div className="px-6 py-8">
        
          {/* Enhanced Navigation */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-8">
            <div className="flex p-2">
              <button
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                  activeTab === 'make' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' 
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
                onClick={() => setActiveTab('make')}
              >
                <span className="text-lg">🚀</span>
                <span>Create Push</span>
              </button>
              <button
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                  activeTab === 'track' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' 
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
                onClick={() => {
                  setActiveTab('track');
                  fetchPushLogs();
                }}
              >
                <span className="text-lg">📊</span>
                <span>Track Results</span>
              </button>
              <button
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                  activeTab === 'calendar' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' 
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
                onClick={() => {
                  setActiveTab('calendar');
                  fetchScheduledPushes();
                }}
              >
                <span className="text-lg">📅</span>
                <span>Scheduled Pushes</span>
              </button>
              <button
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                  activeTab === 'automations' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' 
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
                onClick={() => {
                  setActiveTab('automations');
                  fetchAutomations();
                }}
              >
                <span className="text-lg">🤖</span>
                <span>Automations</span>
              </button>
              <button
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                  activeTab === 'restore' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' 
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
                onClick={() => setActiveTab('restore')}
              >
                <span className="text-lg">📂</span>
                <span>Restore Data</span>
              </button>
            </div>
          </div>
        
        {activeTab === 'make' && (
          <div>
            {/* Enhanced Push Mode Toggle */}
            <div className="mb-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">⚡</span>
                  <h3 className="text-lg font-semibold text-slate-800">Delivery Mode</h3>
                </div>
                <p className="text-sm text-slate-600 mt-1">Choose when to send your push notification</p>
              </div>
              
              <div className="p-6">
                <div className="bg-slate-50 rounded-lg p-1 inline-flex space-x-1">
                  <label className={`flex items-center space-x-3 px-4 py-3 rounded-md cursor-pointer transition-all duration-200 ${
                    pushMode === 'now' 
                      ? 'bg-white shadow-sm text-slate-800 font-medium' 
                      : 'text-slate-600 hover:text-slate-800'
                  }`}>
                    <input
                      type="radio"
                      name="pushMode"
                      checked={pushMode === 'now'}
                      onChange={() => setPushMode('now')}
                      className="sr-only"
                    />
                    <div className={`w-2 h-2 rounded-full transition-colors ${
                      pushMode === 'now' ? 'bg-green-500' : 'bg-slate-300'
                    }`} />
                    <div>
                      <span className="font-medium">Send Immediately</span>
                      <p className="text-sm text-slate-500">Push notification sends right away</p>
                    </div>
                  </label>
                  
                  <label className={`flex items-center space-x-3 px-4 py-3 rounded-md cursor-pointer transition-all duration-200 ${
                    pushMode === 'schedule' 
                      ? 'bg-white shadow-sm text-slate-800 font-medium' 
                      : 'text-slate-600 hover:text-slate-800'
                  }`}>
                    <input
                      type="radio"
                      name="pushMode"
                      checked={pushMode === 'schedule'}
                      onChange={() => setPushMode('schedule')}
                      className="sr-only"
                    />
                    <div className={`w-2 h-2 rounded-full transition-colors ${
                      pushMode === 'schedule' ? 'bg-blue-500' : 'bg-slate-300'
                    }`} />
                    <div>
                      <span className="font-medium">Schedule for Later</span>
                      <p className="text-sm text-slate-500">Draft and schedule for future delivery</p>
                    </div>
                  </label>
                </div>
                
                {savedAudienceCriteria && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <div>
                        <p className="font-medium text-green-800">Audience Criteria Saved</p>
                        <p className="text-sm text-green-700 mt-1">{savedAudienceDescription}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mb-8 p-6 bg-gray-50 rounded-lg border-2 border-gray-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Query Push Audience</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Active in Last (days)</label>
              <Input
                type="number"
                placeholder="e.g. 90"
                value={lastActiveDays}
                onChange={(e) => setLastActiveDays(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={audienceLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NOT Active in Last (days)</label>
              <Input
                type="number"
                placeholder="e.g. 30"
                value={daysSinceLastActiveInactive}
                onChange={(e) => setDaysSinceLastActiveInactive(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={audienceLoading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Traded in Last (days)</label>
              <Input
                type="number"
                placeholder="e.g. 30"
                value={tradedInLastDays}
                onChange={(e) => setTradedInLastDays(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={audienceLoading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NOT Traded in Last (days)</label>
              <Input
                type="number"
                placeholder="e.g. 90"
                value={notTradedInLastDays}
                onChange={(e) => setNotTradedInLastDays(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={audienceLoading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Lifetime Trades</label>
              <Input
                type="number"
                placeholder="e.g. 5"
                value={minLifetimeTrades}
                onChange={(e) => setMinLifetimeTrades(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={audienceLoading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Lifetime Trades</label>
              <Input
                type="number"
                placeholder="e.g. 100"
                value={maxLifetimeTrades}
                onChange={(e) => setMaxLifetimeTrades(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={audienceLoading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Joined After Date</label>
              <Input
                type="date"
                value={joinedAfterDate}
                onChange={(e) => setJoinedAfterDate(e.target.value)}
                disabled={audienceLoading}
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Trusted Trader Status</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="trustedTrader"
                  checked={hasTrustedTrader === null}
                  onChange={() => setHasTrustedTrader(null)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">Any</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="trustedTrader"
                  checked={hasTrustedTrader === true}
                  onChange={() => setHasTrustedTrader(true)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">Trusted Trader</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="trustedTrader"
                  checked={hasTrustedTrader === false}
                  onChange={() => setHasTrustedTrader(false)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">Non-Trusted Trader</span>
              </label>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Trusted Trader Candidate?</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="trustedTraderCandidate"
                  checked={isTrustedTraderCandidate === null}
                  onChange={() => setIsTrustedTraderCandidate(null)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">Any</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="trustedTraderCandidate"
                  checked={isTrustedTraderCandidate === true}
                  onChange={() => setIsTrustedTraderCandidate(true)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">Is a Candidate</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="trustedTraderCandidate"
                  checked={isTrustedTraderCandidate === false}
                  onChange={() => setIsTrustedTraderCandidate(false)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">Not a Candidate</span>
              </label>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Data Packs</label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={topTargetShoe}
                  onChange={(e) => setTopTargetShoe(e.target.checked)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">TOP TARGET SHOE</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={hottestShoeTraded}
                  onChange={(e) => setHottestShoeTraded(e.target.checked)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">YOUR HOTTEST SHOE - TRADES</span>
              </label>
              {hottestShoeTraded && (
                  <div className="pl-6">
                      <label className="text-xs text-gray-500">Lookback (days)</label>
                      <Input 
                          type="number"
                          value={hottestShoeTradedLookback}
                          onChange={(e) => setHottestShoeTradedLookback(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-24 h-8 text-sm"
                          placeholder="30"
                      />
                  </div>
              )}
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={hottestShoeOffers}
                  onChange={(e) => setHottestShoeOffers(e.target.checked)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">YOUR HOTTEST SHOE - OFFERS</span>
              </label>
              {hottestShoeOffers && (
                  <div className="pl-6">
                      <label className="text-xs text-gray-500">Lookback (days)</label>
                      <Input 
                          type="number"
                          value={hottestShoeOffersLookback}
                          onChange={(e) => setHottestShoeOffersLookback(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-24 h-8 text-sm"
                          placeholder="7"
                      />
                  </div>
              )}
            </div>
          </div>

          {pushMode === 'now' ? (
            <Button 
              type="button" 
              onClick={handleGenerateAudience} 
              disabled={audienceLoading}
              className="mb-4"
            >
              {audienceLoading ? 'Generating...' : 'Generate Audience CSV'}
            </Button>
          ) : (
            <div className="flex gap-3 mb-4">
              <Button 
                type="button" 
                onClick={handleSaveAudienceCriteria} 
                disabled={audienceLoading}
                className="bg-green-600 hover:bg-green-500"
              >
                Save Audience Criteria
              </Button>
              <Button 
                type="button" 
                onClick={handleGenerateAudience} 
                disabled={audienceLoading}
              >
                {audienceLoading ? 'Generating...' : 'Generate Audience CSV'}
              </Button>
            </div>
          )}

          {audienceResponse && (
            <div className={`p-4 rounded-md text-sm mb-4 ${audienceResponse.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <p className="font-bold">{audienceResponse.success ? 'Success!' : 'Error'}</p>
              <p>{audienceResponse.message}</p>
              {audienceResponse.success && (
                <>
                  <p className="mt-2"><strong>Audience:</strong> {audienceResponse.audienceDescription}</p>
                  <div className="flex gap-2 mt-3">
                    <Button type="button" onClick={downloadCsv} disabled={!generatedCsv}>
                      Download CSV ({audienceResponse.userCount} users)
                    </Button>
                    <Button type="button" onClick={useGeneratedCsv} disabled={!generatedCsv}>
                      Use for Push
                    </Button>
                  </div>
                  
                  {/* CSV Splitting for A/B Testing */}
                  <div className="mt-4 p-4 bg-blue-50 rounded-md border">
                    <h4 className="font-medium text-blue-900 mb-2">Split for A/B Testing</h4>
                    <div className="flex items-center gap-4 mb-3">
                      <label htmlFor="split_segments" className="block text-sm font-medium text-gray-700">Number of segments (1-20)</label>
                      <Input
                        id="split_segments"
                        type="number"
                        min="1"
                        max="20"
                        value={splitSegments}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                                setSplitSegments('');
                            } else {
                                const num = Math.max(1, Math.min(20, Number(val)));
                                setSplitSegments(num);
                            }
                        }}
                        placeholder="e.g. 5"
                        className="w-24"
                        disabled={!generatedCsv || audienceLoading}
                      />
                    </div>
                    
                    <Button 
                      type="button" 
                      onClick={handleSplitAndDownload} 
                      disabled={!generatedCsv || audienceLoading || !splitSegments}
                      className="mb-3"
                    >
                      {audienceLoading ? 'Generating...' : 'Generate & Download Segments (.zip)'}
                    </Button>
                  </div>

                  {csvPreview && csvPreview.length > 0 && (
                    <div className="mt-4 p-4 border border-gray-700 rounded-lg">
                      <h3 className="text-lg font-semibold mb-2 text-gray-100">Audience Preview (First 4 Rows)</h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-600">
                          <thead className="bg-gray-800">
                            <tr>
                              {Object.keys(csvPreview[0]).map((key) => (
                                <th key={key} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 tracking-wider">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-gray-900 divide-y divide-gray-700">
                            {csvPreview.map((row, index) => (
                              <tr key={index}>
                                {Object.values(row).map((value: any, i) => (
                                  <td key={i} className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                    {value}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="mb-8 p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
          <h2 className="text-xl font-semibold mb-4 text-blue-800">Manual Audience Creation</h2>
          
          <div className="mb-4">
            <label htmlFor="manual_user_ids" className="block text-sm font-medium text-gray-700 mb-1">Enter User IDs</label>
            <Input
              id="manual_user_ids"
              type="text"
              placeholder="up to 5, comma-separated"
              value={manualUserIds}
              onChange={(e) => setManualUserIds(e.target.value)}
              disabled={audienceLoading}
            />
            <p className="text-xs text-gray-500 mt-1">Enter friendly user IDs for testing data packs</p>
          </div>

          <div className="mb-6">
            <h3 className="text-md font-medium text-gray-700 mb-3">Add Data Packs</h3>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={manualTopTargetShoe}
                  onChange={(e) => setManualTopTargetShoe(e.target.checked)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">TOP TARGET SHOE - User's most desired item</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={manualHottestShoeTraded}
                  onChange={(e) => setManualHottestShoeTraded(e.target.checked)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">YOUR HOTTEST SHOE - TRADES - Most traded item in past 30 days</span>
              </label>
              {manualHottestShoeTraded && (
                <div className="pl-6">
                  <label className="text-xs text-gray-500">Lookback (days)</label>
                  <Input
                    type="number"
                    value={manualHottestShoeTradedLookback}
                    onChange={(e) => setManualHottestShoeTradedLookback(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-24 h-8 text-sm"
                    placeholder="30"
                  />
                </div>
              )}
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={manualHottestShoeOffers}
                  onChange={(e) => setManualHottestShoeOffers(e.target.checked)}
                  disabled={audienceLoading}
                  className="mr-2"
                />
                <span className="text-slate-700 font-medium">YOUR HOTTEST SHOE - OFFERS - Most offered item in past 7 days</span>
              </label>
              {manualHottestShoeOffers && (
                <div className="pl-6">
                  <label className="text-xs text-gray-500">Lookback (days)</label>
                  <Input
                    type="number"
                    value={manualHottestShoeOffersLookback}
                    onChange={(e) => setManualHottestShoeOffersLookback(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-24 h-8 text-sm"
                    placeholder="7"
                  />
                </div>
              )}
            </div>
          </div>

          {pushMode === 'now' ? (
            <Button 
              type="button" 
              onClick={handleGenerateManualAudience}
              disabled={audienceLoading || !manualUserIds.trim()}
              className="mb-4"
            >
              {audienceLoading ? 'Generating...' : 'Generate Audience CSV'}
            </Button>
          ) : (
            <div className="flex gap-3 mb-4">
              <Button 
                type="button" 
                onClick={handleSaveManualAudienceCriteria}
                disabled={audienceLoading || !manualUserIds.trim()}
                className="bg-green-600 hover:bg-green-500"
              >
                Save Audience Criteria
              </Button>
              <Button 
                type="button" 
                onClick={handleGenerateManualAudience}
                disabled={audienceLoading || !manualUserIds.trim()}
              >
                {audienceLoading ? 'Generating...' : 'Generate Audience CSV'}
              </Button>
            </div>
          )}
        </div>

        {/* External Audience File Segmentation */}
        <div className="mb-8 p-6 bg-purple-50 rounded-lg border-2 border-purple-200">
          <h2 className="text-xl font-semibold mb-4 text-purple-800">Segment External Audience File</h2>
          <p className="text-sm text-gray-600 mb-4">Upload a CSV audience file created elsewhere and split it into smaller segments for A/B testing.</p>
          
          <div className="mb-4">
            <label htmlFor="external_file" className="block text-sm font-medium text-gray-700 mb-2">
              Upload Audience CSV File
            </label>
            <input
              id="external_file"
              type="file"
              accept=".csv"
              onChange={handleExternalFileUpload}
              disabled={externalFileLoading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 disabled:opacity-50"
            />
            {externalFile && (
              <p className="text-xs text-gray-500 mt-1">
                Uploaded: {externalFile.name} ({(externalFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {externalFileLoading && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
              Processing file...
            </div>
          )}

          {externalCsvData && !externalFileLoading && (
            <div className="space-y-4">
              {/* File Preview */}
              {externalCsvPreview && externalCsvPreview.length > 0 && (
                <div className="p-4 border border-gray-200 rounded-lg bg-white">
                  <h3 className="text-md font-medium text-gray-700 mb-2">File Preview (First 4 Rows)</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(externalCsvPreview[0] || {}).map((header) => (
                            <th key={header} className="px-3 py-2 text-left font-medium text-gray-700 border-b">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {externalCsvPreview.map((row, index) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            {Object.values(row).map((value, cellIndex) => (
                              <td key={cellIndex} className="px-3 py-2 border-b text-gray-600">
                                {String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Segmentation Controls */}
              <div className="p-4 border border-gray-200 rounded-lg bg-white">
                <h4 className="font-medium text-purple-900 mb-2">Split for A/B Testing</h4>
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-sm text-gray-600">Number of segments:</label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={splitSegments}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        setSplitSegments('');
                      } else {
                        const num = parseInt(value, 10);
                        if (num >= 1 && num <= 20) {
                          setSplitSegments(num);
                        }
                      }
                    }}
                    className="w-20 h-8 text-sm"
                    disabled={externalFileLoading}
                  />
                </div>
                
                <Button 
                  type="button" 
                  onClick={handleExternalFileSplit} 
                  disabled={!externalCsvData || externalFileLoading || !splitSegments}
                  className="bg-purple-600 hover:bg-purple-500"
                >
                  {externalFileLoading ? 'Processing...' : 'Generate & Download Segments (.zip)'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Push Notification Section */}
        <div className="mb-8 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-indigo-50 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center space-x-2">
              <span className="text-xl">📤</span>
              <h2 className="text-xl font-semibold text-slate-800">
                {pushMode === 'now' ? 'Send Push Notification' : 'Draft Push Notification'}
              </h2>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              {pushMode === 'now' ? 'Configure and send your push notification immediately' : 'Create and schedule your push notification for later'}
            </p>
          </div>
          
          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
                      <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Notification Title</label>
            <Input
              id="title"
              type="text"
              placeholder="e.g. Hey there! Those [[var:top_target_shoe_name]]s are waiting..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">Use [[var:column_name]] to insert CSV data (e.g., [[var:top_target_shoe_name]])</p>
          </div>

          <div>
            <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">Notification Body</label>
            <Textarea
              id="body"
              placeholder="e.g. We saw you hunting for [[var:top_target_shoe_name]]s, so we generated some offers for you!"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">Personalize with variables like [[var:top_target_shoe_name]] or [[var:user_first_name]]</p>
          </div>

          <div>
            <label htmlFor="deeplink" className="block text-sm font-medium text-gray-700 mb-1">Deep Link URL (Optional)</label>
            <Input
              id="deeplink"
              type="url"
              placeholder="e.g. https://tradeblock.us/offers/variant/[[var:top_target_shoe_variantid]]"
              value={deepLink}
              onChange={(e) => setDeepLink(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">Where to direct users when they tap the notification. Use variables for personalized links!</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Push Notification Type (Layer)</label>
            <div className="flex gap-4 p-2 bg-slate-100 rounded-lg flex-wrap">
              <label className="flex items-center">
                <input type="radio" name="notificationLayer" value={5} checked={notificationLayer === 5} onChange={() => setNotificationLayer(5)} className="mr-2" />
                <span className="text-sm font-medium text-slate-700">Layer 5: New User Series</span>
              </label>
              <label className="flex items-center">
                <input type="radio" name="notificationLayer" value={1} checked={notificationLayer === 1} onChange={() => setNotificationLayer(1)} className="mr-2" />
                <span className="text-sm font-medium text-slate-700">Layer 1: Platform-Wide Moments</span>
              </label>
              <label className="flex items-center">
                <input type="radio" name="notificationLayer" value={2} checked={notificationLayer === 2} onChange={() => setNotificationLayer(2)} className="mr-2" />
                <span className="text-sm font-medium text-slate-700">Layer 2: Product/Trend Triggers</span>
              </label>
              <label className="flex items-center">
                <input type="radio" name="notificationLayer" value={3} checked={notificationLayer === 3} onChange={() => setNotificationLayer(3)} className="mr-2" />
                <span className="text-sm font-medium text-slate-700">Layer 3: Behavior-Responsive</span>
              </label>
              <label className="flex items-center">
                <input type="radio" name="notificationLayer" value={4} checked={notificationLayer === 4} onChange={() => setNotificationLayer(4)} className="mr-2" />
                <span className="text-sm font-medium text-slate-700">Test</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">Layer 5 has 96-hour cooldown, Layer 3 has 72-hour cooldown, and Layers 2+3 have combined weekly limits. This classification is required for smart cadence filtering.</p>
          </div>

          <div>
            <label htmlFor="user_csv" className="block text-sm font-medium text-gray-700 mb-1">
              Upload User ID CSV
            </label>
            <input
              id="user_csv"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 disabled:opacity-50"
              disabled={isLoading}
            />
            {file && <p className="text-xs text-gray-500 mt-1">Selected: {file.name}</p>}
          </div>

          {csvColumns.length > 0 && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm font-medium text-green-800 mb-2">Available Variables:</p>
              <div className="flex flex-wrap gap-2">
                {csvColumns.map(column => (
                  <span 
                    key={column} 
                    className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded cursor-pointer hover:bg-green-200"
                    onClick={() => {
                      navigator.clipboard.writeText(`[[var:${column}]]`);
                      alert(`Copied [[var:${column}]] to clipboard!`);
                    }}
                  >
                    [[var:{column}]]
                  </span>
                ))}
              </div>
              <p className="text-xs text-green-600 mt-1">Click any variable to copy it to clipboard</p>
            </div>
          )}

          <div className="flex items-center space-x-4">
              {pushMode === 'now' ? (
                <>
                  <Button type="submit" disabled={isLoading} className="flex-1">
                    Blast It!
                  </Button>
                  <Button type="button" onClick={handleDryRun} disabled={isLoading} className="flex-1 bg-gray-600 hover:bg-gray-500">
                    Dry Run
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    type="button" 
                    onClick={handleScheduleClick} 
                    disabled={isLoading} 
                    className="flex-1 bg-blue-600 hover:bg-blue-500"
                  >
                    Schedule It!
                  </Button>
                  <Button type="button" onClick={handleDryRun} disabled={isLoading} className="flex-1 bg-gray-600 hover:bg-gray-500">
                    Dry Run
                  </Button>
                </>
              )}
            </div>
            </form>
            
            {response && (
              <div className={`mt-6 p-4 rounded-md text-sm ${response.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                <p className="font-bold">{response.success ? 'Success!' : 'Error'}</p>
                <p>{response.message}</p>
                {response.failedTokens && response.failedTokens.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold">Failed tokens:</p>
                    <ul className="list-disc list-inside">
                      {response.failedTokens.map(token => <li key={token} className="truncate">{token}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
          </div>
        )}

        {activeTab === 'track' && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Push Notification History</h2>
            
            {logsLoading ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Loading logs...</p>
              </div>
            ) : pushLogs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No push notifications sent yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pushLogs.map((log) => {
                  const statusInfo = getStatusInfo(log);
                  return (
                    <div key={log.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{log.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{log.body}</p>
                          {log.deepLink && (
                            <p 
                              className="text-xs text-blue-600 mt-1 cursor-pointer hover:text-blue-800" 
                              onClick={() => copyToClipboard(log.deepLink)}
                              title={`Click to copy full URL: ${log.deepLink}`}
                            >
                              → {truncateUrl(log.deepLink)}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${statusInfo.className}`}>
                            {statusInfo.text}
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-xs text-gray-500 space-y-1">
                        <p><strong>Audience:</strong> {log.audienceDescription} ({log.audienceSize} users)</p>
                        {log.successCount !== undefined && log.totalCount !== undefined && (
                          <p><strong>Delivery:</strong> {log.successCount} of {log.totalCount} notifications sent</p>
                        )}
                        <p><strong>Sent:</strong> {new Date(log.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-800">Scheduled Push Notifications</h2>
              <div className="flex items-center gap-4">
                <div className="flex border border-gray-300 rounded-lg">
                  <button
                    className={`px-4 py-2 text-sm font-medium ${
                      calendarView === 'monthly' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    } rounded-l-lg border-r border-gray-300`}
                    onClick={() => setCalendarView('monthly')}
                  >
                    Monthly
                  </button>
                  <button
                    className={`px-4 py-2 text-sm font-medium ${
                      calendarView === 'weekly' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    } rounded-r-lg`}
                    onClick={() => setCalendarView('weekly')}
                  >
                    Weekly
                  </button>
                </div>
              </div>
            </div>

            {calendarLoading ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Loading scheduled pushes...</p>
              </div>
            ) : (
              <div>
                {calendarView === 'monthly' ? (
                  <div className="bg-white border border-gray-200 rounded-lg">
                    {/* Month Navigation */}
                    <div className="flex justify-between items-center p-4 border-b border-gray-200">
                      <button
                        onClick={() => navigateMonth('prev')}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        ←
                      </button>
                      <h3 className="text-lg font-semibold">
                        {currentDate.toLocaleDateString('en-US', { 
                          month: 'long', 
                          year: 'numeric' 
                        })}
                      </h3>
                      <button
                        onClick={() => navigateMonth('next')}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        →
                      </button>
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-0">
                      {/* Day Headers */}
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="p-3 text-center text-sm font-medium text-gray-500 border-b border-gray-200">
                          {day}
                        </div>
                      ))}

                      {/* Calendar Days */}
                      {Array.from({ length: getFirstDayOfMonth(currentDate) }, (_, i) => (
                        <div key={`empty-${i}`} className="p-3 h-24 border-b border-r border-gray-200"></div>
                      ))}

                      {Array.from({ length: getDaysInMonth(currentDate) }, (_, i) => {
                        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1);
                        const dayPushes = getPushesForDate(date);
                        const isToday = isSameDay(date, new Date());

                        return (
                          <div 
                            key={i + 1} 
                            className={`p-2 h-24 border-b border-r border-gray-200 ${
                              isToday ? 'bg-blue-50' : ''
                            } hover:bg-gray-50`}
                          >
                            <div className={`text-sm ${isToday ? 'font-bold text-blue-600' : ''}`}>
                              {i + 1}
                            </div>
                            <div className="mt-1 space-y-1">
                              {dayPushes.map(push => {
                                const isSent = push.status === 'sent';
                                return (
                                <div
                                  key={push.id}
                                  onClick={() => handlePushClick(push)}
                                  className={`text-xs px-2 py-1 rounded cursor-pointer truncate ${
                                    isSent 
                                      ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                  }`}
                                  title={push.title}
                                >
                                  {new Date(push.scheduledFor).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  })} - {push.title}
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-lg">
                    {/* Week Navigation */}
                    <div className="flex justify-between items-center p-4 border-b border-gray-200">
                      <button
                        onClick={() => navigateWeek('prev')}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        ←
                      </button>
                      <h3 className="text-lg font-semibold">
                        Week of {formatDate(getWeekDays(currentDate)[0])}
                      </h3>
                      <button
                        onClick={() => navigateWeek('next')}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        →
                      </button>
                    </div>

                    {/* Weekly Grid */}
                    <div className="grid grid-cols-7 gap-0">
                      {getWeekDays(currentDate).map((date, i) => {
                        const dayPushes = getPushesForDate(date);
                        const isToday = isSameDay(date, new Date());

                        return (
                          <div 
                            key={i}
                            className={`p-3 h-80 border-r border-gray-200 ${
                              isToday ? 'bg-blue-50' : ''
                            } hover:bg-gray-50`}
                          >
                            <div className={`text-sm font-medium mb-2 ${
                              isToday ? 'text-blue-600' : ''
                            }`}>
                              {date.toLocaleDateString('en-US', { 
                                weekday: 'short', 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </div>
                            <div className="space-y-1">
                              {dayPushes.map(push => {
                                const isSent = push.status === 'sent';
                                return (
                                <div
                                  key={push.id}
                                  onClick={() => handlePushClick(push)}
                                  className={`text-xs px-2 py-1 rounded cursor-pointer ${
                                    isSent 
                                      ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                  }`}
                                  title={push.title}
                                >
                                  <div className="font-medium">
                                    {new Date(push.scheduledFor).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true
                                    })}
                                  </div>
                                  <div className="truncate">{push.title}</div>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {scheduledPushes.length === 0 && !calendarLoading && (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No scheduled push notifications found.</p>
                    <p className="text-sm text-gray-400 mt-1">Create scheduled pushes from the "Make" tab.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Push Details Modal */}
        {showPushModal && selectedPush && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  {modalTrackingRecord ? 'Push Notification Tracking' : 'Push Draft Details'}
                </h3>
                <button
                  onClick={() => setShowPushModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {/* Tracking Record Display */}
              {modalTrackingRecord ? (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{modalTrackingRecord.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">{modalTrackingRecord.body}</p>
                      {modalTrackingRecord.deepLink && (
                        <p 
                          className="text-xs text-blue-600 mt-1 cursor-pointer hover:text-blue-800" 
                          onClick={() => copyToClipboard(modalTrackingRecord.deepLink)}
                          title={`Click to copy full URL: ${modalTrackingRecord.deepLink}`}
                        >
                          → {truncateUrl(modalTrackingRecord.deepLink)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getStatusInfo(modalTrackingRecord).className}`}>
                        {getStatusInfo(modalTrackingRecord).text}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-500 space-y-1">
                    <p><strong>Audience:</strong> {modalTrackingRecord.audienceDescription} ({modalTrackingRecord.audienceSize} users)</p>
                    {modalTrackingRecord.successCount !== undefined && modalTrackingRecord.totalCount !== undefined && (
                      <p><strong>Delivery:</strong> {modalTrackingRecord.successCount} of {modalTrackingRecord.totalCount} notifications sent</p>
                    )}
                    <p><strong>Sent:</strong> {new Date(modalTrackingRecord.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Audience Criteria (Read-only) */}
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
                <h4 className="text-md font-medium text-gray-800 mb-2">Audience Criteria</h4>
                <p className="text-sm text-gray-700">{selectedPush.audienceDescription}</p>
                <div className="text-xs text-gray-500 mt-2">
                  Scheduled for: {new Date(selectedPush.scheduledFor).toLocaleString()}
                </div>
              </div>

              {/* Editable Push Content */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notification Title
                  </label>
                  <Input
                    type="text"
                    value={editingPush?.title || ''}
                    onChange={(e) => setEditingPush((prev: any) => prev ? {...prev, title: e.target.value} : null)}
                    disabled={modalIsLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notification Body
                  </label>
                  <Textarea
                    value={editingPush?.body || ''}
                    onChange={(e) => setEditingPush((prev: any) => prev ? {...prev, body: e.target.value} : null)}
                    disabled={modalIsLoading}
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Deep Link URL (Optional)
                  </label>
                  <Input
                    type="url"
                    value={editingPush?.deepLinkUrl || ''}
                    onChange={(e) => setEditingPush((prev: any) => prev ? {...prev, deepLinkUrl: e.target.value} : null)}
                    disabled={modalIsLoading}
                  />
                </div>
              </div>

              {/* Save Changes Button */}
              <div className="mb-6">
                <Button
                  type="button"
                  onClick={handleSavePushChanges}
                  disabled={modalIsLoading}
                  className="w-full"
                >
                  {modalIsLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>

              {/* Modal Response Messages */}
              {modalResponse && (
                <div className={`p-4 rounded-md text-sm mb-6 ${
                  modalResponse.success 
                    ? 'bg-green-50 text-green-800 border border-green-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  <p className="font-bold">{modalResponse.success ? 'Success!' : 'Error'}</p>
                  <p>{modalResponse.message}</p>
                  {modalResponse.success && modalResponse.jobId && (
                    <div className="mt-2">
                      <p className="text-xs text-green-600">
                        Job ID: {modalResponse.jobId}
                      </p>
                    </div>
                  )}
                  {modalResponse.failedTokens && modalResponse.failedTokens.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-red-600">
                        {modalResponse.failedTokens.length} tokens failed
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Audience Generation Section */}
              <div className="border-t pt-6">
                <h4 className="text-md font-medium text-gray-800 mb-4">Generate Audience & Send</h4>
                
                <Button
                  type="button"
                  onClick={handleGenerateModalAudience}
                  disabled={modalAudienceLoading}
                  className="mb-4"
                >
                  {modalAudienceLoading ? 'Generating...' : 'Generate Audience CSV'}
                </Button>

                <div className="text-sm text-gray-500 mb-4">
                  <p>This will generate the audience based on the saved criteria:</p>
                  <p className="italic">{selectedPush.audienceDescription}</p>
                </div>

                {/* Audience Results */}
                {modalAudienceResponse && (
                  <div className={`p-4 rounded-md text-sm mb-4 ${modalAudienceResponse.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    <p className="font-bold">{modalAudienceResponse.success ? 'Success!' : 'Error'}</p>
                    <p>{modalAudienceResponse.message}</p>
                    {modalAudienceResponse.success && (
                      <>
                        <div className="flex gap-2 mt-3">
                          <Button type="button" onClick={downloadModalCsv} disabled={!modalGeneratedCsv}>
                            Download CSV ({modalAudienceResponse.userCount} users)
                          </Button>
                          <Button type="button" onClick={useModalGeneratedCsv} disabled={!modalGeneratedCsv}>
                            Use for Push
                          </Button>
                        </div>
                        
                        {/* CSV Splitting for A/B Testing */}
                        <div className="mt-4 p-4 bg-blue-50 rounded-md border">
                          <h4 className="font-medium text-blue-900 mb-2">Split for A/B Testing</h4>
                          <div className="flex items-center gap-4 mb-3">
                            <label htmlFor="modal_split_segments" className="block text-sm font-medium text-gray-700">Number of segments (1-20)</label>
                            <Input
                              id="modal_split_segments"
                              type="number"
                              min="1"
                              max="20"
                              value={splitSegments}
                              onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '') {
                                      setSplitSegments('');
                                  } else {
                                      const num = Math.max(1, Math.min(20, Number(val)));
                                      setSplitSegments(num);
                                  }
                              }}
                              placeholder="e.g. 5"
                              className="w-24"
                              disabled={!modalGeneratedCsv || modalAudienceLoading}
                            />
                          </div>
                          
                          <Button 
                            type="button" 
                            onClick={handleSplitAndDownload} 
                            disabled={!modalGeneratedCsv || modalAudienceLoading || !splitSegments}
                            className="mb-3"
                          >
                            {modalAudienceLoading ? 'Generating...' : 'Generate & Download Segments (.zip)'}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Upload User ID CSV Section */}
                <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
                  <h4 className="font-medium text-gray-800 mb-3">Upload User ID CSV</h4>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleModalFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 disabled:opacity-50"
                    disabled={modalIsLoading}
                  />
                  {modalFile && <p className="text-xs text-gray-500 mt-1">Selected: {modalFile.name}</p>}
                </div>

                {/* Send Push Buttons */}
                <div className="flex items-center space-x-4 mt-6">
                  <Button 
                    type="button" 
                    onClick={() => handleModalSendPush(false)} 
                    disabled={modalIsLoading || !modalFile} 
                    className="flex-1"
                  >
                    {modalIsLoading ? 'Sending...' : 'Blast It!'}
                  </Button>
                  <Button 
                    type="button" 
                    onClick={() => handleModalSendPush(true)} 
                    disabled={modalIsLoading || !modalFile} 
                    className="flex-1 bg-gray-600 hover:bg-gray-500"
                  >
                    Dry Run
                  </Button>
                </div>
              </div>
                </>
              )}

              {/* Close Button */}
              <div className="mt-6 flex justify-end">
                <Button
                  type="button"
                  onClick={() => setShowPushModal(false)}
                  className="bg-gray-600 hover:bg-gray-500"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'automations' && (
          <div>
            {/* Automation Management Dashboard */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">🤖</span>
                    <h2 className="text-lg font-semibold text-slate-800">Automation Dashboard</h2>
                  </div>
                  <Button 
                    onClick={handleCreateAutomation}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    + New Automation
                  </Button>
                </div>
                <p className="text-sm text-slate-600 mt-1">Manage automated push notification sequences and campaigns</p>
              </div>
              
              <div className="p-6">
                {/* Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-green-600 text-lg">✅</span>
                      <div>
                        <p className="text-sm font-medium text-green-800">Active</p>
                        <p className="text-2xl font-bold text-green-900">{automationStats.active}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-blue-600 text-lg">⏰</span>
                      <div>
                        <p className="text-sm font-medium text-blue-800">Scheduled</p>
                        <p className="text-2xl font-bold text-blue-900">{automationStats.scheduled}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-yellow-600 text-lg">⏸️</span>
                      <div>
                        <p className="text-sm font-medium text-yellow-800">Paused</p>
                        <p className="text-2xl font-bold text-yellow-900">{automationStats.paused}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-600 text-lg">📊</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">Total</p>
                        <p className="text-2xl font-bold text-gray-900">{automationStats.total}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Automation List */}
                <div className="bg-slate-50 rounded-lg p-6">
                  {automationLoading ? (
                    <div className="text-center py-12">
                      <span className="text-4xl opacity-50">⏳</span>
                      <h3 className="text-lg font-medium text-gray-900 mt-4">Loading Automations...</h3>
                    </div>
                  ) : automations.length === 0 ? (
                    <div className="text-center py-12">
                      <span className="text-6xl opacity-50">🤖</span>
                      <h3 className="text-lg font-medium text-gray-900 mt-4">No Automations Yet</h3>
                      <p className="text-sm text-gray-500 mt-2">
                        Create your first automation to start sending automated push notification sequences.
                      </p>
                      <Button 
                        onClick={handleCreateAutomation}
                        className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                      >
                        Create First Automation
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {automations.map((automation) => (
                        <div key={automation.id} className="bg-white rounded-lg p-4 border border-slate-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-medium text-gray-900">{automation.name}</h3>
                              <p className="text-sm text-gray-600 mt-1">{automation.description}</p>
                              <div className="flex items-center space-x-4 mt-2">
                                <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                                  automation.status === 'active' 
                                    ? 'bg-green-100 text-green-800'
                                    : automation.status === 'scheduled'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {automation.status}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {automation.pushSequence?.length || 0} pushes
                                </span>
                                <span className="text-xs text-gray-500">
                                  {automation.type}
                                </span>
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <Button 
                                onClick={() => router.push(`/test-automation/${automation.id}`)}
                                className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded text-xs font-medium transition-colors"
                              >
                                Test
                              </Button>
                              <Button 
                                onClick={() => router.push(`/edit-automation/${automation.id}`)}
                                className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-xs font-medium transition-colors"
                              >
                                Edit
                              </Button>
                              <Button 
                                onClick={() => handleDeleteAutomation(automation.id, automation.name)}
                                className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-xs font-medium transition-colors"
                                title="Delete automation"
                              >
                                🗑️
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Template Gallery */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">📋</span>
                  <h2 className="text-lg font-semibold text-slate-800">Automation Templates</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">Pre-built automation sequences for common use cases</p>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Onboarding Template */}
                  <div className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors cursor-pointer">
                    <div className="flex items-center space-x-2 mb-3">
                      <span className="text-lg">👋</span>
                      <h3 className="font-medium text-gray-900">New User Onboarding</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      Welcome sequence for new users with 4 targeted pushes over their first week.
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">4 pushes • 7 days</span>
                      <Button 
                        onClick={() => handleUseTemplate('onboarding')}
                        className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        Use Template
                      </Button>
                    </div>
                  </div>
                  
                  {/* Retention Template */}
                  <div className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors cursor-pointer">
                    <div className="flex items-center space-x-2 mb-3">
                      <span className="text-lg">🔄</span>
                      <h3 className="font-medium text-gray-900">Re-engagement Campaign</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      Bring back inactive users with personalized product recommendations.
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">3 pushes • 14 days</span>
                      <Button 
                        onClick={() => handleUseTemplate('retention')}
                        className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        Use Template
                      </Button>
                    </div>
                  </div>
                  
                  {/* Feature Announcement Template */}
                  <div className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors cursor-pointer">
                    <div className="flex items-center space-x-2 mb-3">
                      <span className="text-lg">🚀</span>
                      <h3 className="font-medium text-gray-900">Feature Announcement</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      Launch new features with targeted notifications to relevant user segments.
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">2 pushes • 3 days</span>
                      <Button 
                        onClick={() => handleUseTemplate('feature')}
                        className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        Use Template
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Monitoring Dashboard */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">📊</span>
                  <h2 className="text-lg font-semibold text-slate-800">Real-time Monitoring</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">Live automation execution status and performance metrics</p>
              </div>
              
              <div className="p-6">
                <div className="bg-slate-50 rounded-lg p-6">
                  <div className="text-center py-8">
                    <span className="text-4xl opacity-50">📈</span>
                    <h3 className="text-lg font-medium text-gray-900 mt-4">No Active Automations</h3>
                    <p className="text-sm text-gray-500 mt-2">
                      Monitoring data will appear here when automations are running.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'restore' && (
          <div>
            {/* Retroactive Deep Link Updates */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">🔗</span>
                  <h2 className="text-lg font-semibold text-slate-800">Update Existing Records with Deep Links</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">Automatically add missing deep_link data to existing records using Track Results</p>
              </div>
              
              <div className="p-6">
                <div className="space-y-4">
                  <p className="text-sm text-gray-700">
                    This will match existing records in your database with Track Results logs and add any missing deep_link information.
                  </p>
                  
                  <button
                    onClick={handleRetroactiveDeepLinkUpdate}
                    disabled={deepLinkUpdateLoading}
                    className={`px-6 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                      deepLinkUpdateLoading
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-500/25'
                    }`}
                  >
                    {deepLinkUpdateLoading ? 'Updating...' : 'Update Missing Deep Links'}
                  </button>

                  {deepLinkUpdateResponse && (
                    <div className={`p-4 rounded-lg border ${
                      deepLinkUpdateResponse.success 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <h3 className={`font-medium text-sm ${
                        deepLinkUpdateResponse.success ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {deepLinkUpdateResponse.success ? 'Success!' : 'Error'}
                      </h3>
                      <p className={`text-sm mt-1 ${
                        deepLinkUpdateResponse.success ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {deepLinkUpdateResponse.message || deepLinkUpdateResponse.error}
                      </p>
                      
                      {deepLinkUpdateResponse.details && (
                        <div className="mt-3 text-xs space-y-1">
                          {deepLinkUpdateResponse.details.updatedCount !== undefined && (
                            <p className="text-green-600">
                              <span className="font-medium">Records updated:</span> {deepLinkUpdateResponse.details.updatedCount}
                            </p>
                          )}
                          {deepLinkUpdateResponse.details.errors && deepLinkUpdateResponse.details.errors.length > 0 && (
                            <div className="text-red-600">
                              <p className="font-medium">Errors:</p>
                              <div className="ml-2 space-y-1">
                                {deepLinkUpdateResponse.details.errors.map((error: string, index: number) => (
                                  <p key={index}>{error}</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Smart CSV Matching */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">🎯</span>
                  <h2 className="text-lg font-semibold text-slate-800">Smart CSV Matching</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">Upload audience CSV and we'll find the matching Track Results log automatically</p>
              </div>
              
              <div className="p-6">
                <div className="space-y-6">
                  {/* File Upload */}
                  <div>
                    <label htmlFor="smart-matching-file-input" className="block text-sm font-medium text-gray-700 mb-2">
                      Select Audience CSV File
                    </label>
                    <div className="flex items-center space-x-4">
                      <input
                        id="smart-matching-file-input"
                        type="file"
                        accept=".csv"
                        onChange={handleSmartMatchingFileUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {smartMatchingFile && (
                        <span className="text-sm text-blue-600 font-medium">
                          {smartMatchingFile.name}
                        </span>
                      )}
                    </div>
                    {smartMatchingLoading && (
                      <p className="text-sm text-blue-600 mt-2">🔍 Analyzing CSV and finding matching Track Results...</p>
                    )}
                  </div>

                  {/* Matching Results */}
                  {matchingLogs.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">
                        Found {matchingLogs.length} potential matches - select the correct one:
                      </h3>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {matchingLogs.map((log, index) => (
                          <div
                            key={log.id}
                            className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 ${
                              selectedLog?.id === log.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                            onClick={() => setSelectedLog(log)}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900">{log.title}</h4>
                                <p className="text-sm text-gray-600 mt-1">{log.body}</p>
                                {log.deepLink && (
                                  <p className="text-xs text-blue-600 mt-1">{log.deepLink}</p>
                                )}
                                <p className="text-xs text-gray-500 mt-2">
                                  {log.audienceDescription} • {new Date(log.timestamp).toLocaleString()}
                                </p>
                              </div>
                              <div className="ml-4 text-right">
                                <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                                  log.matchQuality >= 95 ? 'bg-green-100 text-green-800' :
                                  log.matchQuality >= 85 ? 'bg-blue-100 text-blue-800' :
                                  log.matchQuality >= 70 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {log.matchQuality}% match
                                </span>
                                <p className="text-xs text-gray-500 mt-1">
                                  {log.audienceSize} users
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Convert Button */}
                  {selectedLog && (
                    <div>
                      <button
                        onClick={handleSmartConversion}
                        disabled={smartConversionLoading}
                        className={`px-6 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                          smartConversionLoading
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/25'
                        }`}
                      >
                        {smartConversionLoading ? 'Converting...' : 'Convert to Historical Records'}
                      </button>
                    </div>
                  )}

                  {/* Response Display */}
                  {smartConversionResponse && (
                    <div className={`p-4 rounded-lg border ${
                      smartConversionResponse.success 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <h3 className={`font-medium text-sm ${
                        smartConversionResponse.success ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {smartConversionResponse.success ? 'Success!' : 'Error'}
                      </h3>
                      <p className={`text-sm mt-1 ${
                        smartConversionResponse.success ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {smartConversionResponse.message || smartConversionResponse.error}
                      </p>
                      
                      {smartConversionResponse.details && (
                        <div className="mt-3 text-xs space-y-1">
                          {smartConversionResponse.details.insertedRows !== undefined && (
                            <p className="text-green-600">
                              <span className="font-medium">Historical records created:</span> {smartConversionResponse.details.insertedRows}
                            </p>
                          )}
                          {smartConversionResponse.details.duplicatesSkipped > 0 && (
                            <p className="text-yellow-600">
                              <span className="font-medium">Duplicates skipped:</span> {smartConversionResponse.details.duplicatesSkipped}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Historical Data Restoration */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
              <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">📂</span>
                  <h2 className="text-lg font-semibold text-slate-800">Manual CSV Upload</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">Upload pre-formatted historical data CSV files (advanced users)</p>
              </div>
              
              <div className="p-6">
                <div className="space-y-6">
                  {/* File Upload Section */}
                  <div>
                    <label htmlFor="restoration-file-input" className="block text-sm font-medium text-gray-700 mb-2">
                      Select Historical Data CSV
                    </label>
                    <div className="flex items-center space-x-4">
                      <input
                        id="restoration-file-input"
                        type="file"
                        accept=".csv"
                        onChange={handleRestorationFileUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {restorationFile && (
                        <span className="text-sm text-green-600 font-medium">
                          {restorationFile.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      CSV should contain columns: user_id, layer_id, push_title, sent_at (required), push_body, audience_description (optional)
                    </p>
                  </div>

                  {/* Upload Button */}
                  <div>
                    <button
                      onClick={handleRestoreHistoricalData}
                      disabled={!restorationFile || restorationLoading}
                      className={`px-6 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                        !restorationFile || restorationLoading
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/25'
                      }`}
                    >
                      {restorationLoading ? 'Restoring Data...' : 'Restore Historical Data'}
                    </button>
                  </div>

                  {/* Response Display */}
                  {restorationResponse && (
                    <div className={`p-4 rounded-lg border ${
                      restorationResponse.success 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <h3 className={`font-medium text-sm ${
                        restorationResponse.success ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {restorationResponse.success ? 'Success!' : 'Error'}
                      </h3>
                      <p className={`text-sm mt-1 ${
                        restorationResponse.success ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {restorationResponse.message || restorationResponse.error}
                      </p>
                      
                      {restorationResponse.details && (
                        <div className="mt-3 text-xs space-y-1">
                          {restorationResponse.details.totalRows && (
                            <p className="text-slate-600">
                              <span className="font-medium">Total rows processed:</span> {restorationResponse.details.totalRows}
                            </p>
                          )}
                          {restorationResponse.details.insertedRows !== undefined && (
                            <p className="text-green-600">
                              <span className="font-medium">Successfully inserted:</span> {restorationResponse.details.insertedRows}
                            </p>
                          )}
                          {restorationResponse.details.duplicatesSkipped > 0 && (
                            <p className="text-yellow-600">
                              <span className="font-medium">Duplicates skipped:</span> {restorationResponse.details.duplicatesSkipped}
                            </p>
                          )}
                          {restorationResponse.details.invalidRows && restorationResponse.details.invalidRows.length > 0 && (
                            <div className="text-red-600">
                              <p className="font-medium">Invalid rows ({restorationResponse.details.invalidRows.length}):</p>
                              <div className="ml-2 space-y-1 max-h-32 overflow-y-auto">
                                {restorationResponse.details.invalidRows.slice(0, 5).map((row: any, index: number) => (
                                  <p key={index}>Row {row.rowIndex}: {row.errors.join(', ')}</p>
                                ))}
                                {restorationResponse.details.invalidRows.length > 5 && (
                                  <p>... and {restorationResponse.details.invalidRows.length - 5} more</p>
                                )}
                              </div>
                            </div>
                          )}
                          {restorationResponse.details.errors && restorationResponse.details.errors.length > 0 && (
                            <div className="text-red-600">
                              <p className="font-medium">Errors:</p>
                              <div className="ml-2 space-y-1">
                                {restorationResponse.details.errors.map((error: string, index: number) => (
                                  <p key={index}>{error}</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Instructions */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-slate-800 mb-2">CSV Format Requirements:</h4>
                    <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                      <li><strong>user_id:</strong> Valid UUID of the user who received the notification</li>
                      <li><strong>layer_id:</strong> Number (1, 2, 3, or 4) representing the notification layer</li>
                      <li><strong>push_title:</strong> Title/subject of the push notification</li>
                      <li><strong>sent_at:</strong> Date/time when the notification was sent (ISO format preferred)</li>
                      <li><strong>push_body:</strong> (Optional) Body content of the notification</li>
                      <li><strong>audience_description:</strong> (Optional) Description of the target audience</li>
                    </ul>
                    <p className="text-xs text-slate-500 mt-2">
                      The system will automatically detect and skip duplicate entries based on user_id + sent_at combination.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Audience to History Conversion */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">🔄</span>
                  <h2 className="text-lg font-semibold text-slate-800">Convert Audience CSV to Historical Data</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">Upload an audience CSV and fill in push details to create historical records</p>
              </div>
              
              <div className="p-6">
                <div className="space-y-6">
                  {/* Audience File Upload */}
                  <div>
                    <label htmlFor="audience-file-input" className="block text-sm font-medium text-gray-700 mb-2">
                      Select Audience CSV File
                    </label>
                    <div className="flex items-center space-x-4">
                      <input
                        id="audience-file-input"
                        type="file"
                        accept=".csv"
                        onChange={handleAudienceFileUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                      />
                      {audienceFile && (
                        <span className="text-sm text-green-600 font-medium">
                          {audienceFile.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Any audience CSV with user_id column (or similar: userId, id, etc.)
                    </p>
                  </div>

                  {/* Push Details Form */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Layer Selection */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Notification Layer</label>
                      <div className="flex gap-4 p-2 bg-slate-100 rounded-lg">
                        <label className="flex items-center">
                          <input type="radio" name="historyNotificationLayer" value={1} checked={historyLayerId === 1} onChange={() => setHistoryLayerId(1)} className="mr-2" />
                          <span className="text-sm font-medium text-slate-700">Layer 1: Platform-Wide</span>
                        </label>
                        <label className="flex items-center">
                          <input type="radio" name="historyNotificationLayer" value={2} checked={historyLayerId === 2} onChange={() => setHistoryLayerId(2)} className="mr-2" />
                          <span className="text-sm font-medium text-slate-700">Layer 2: Product/Trend</span>
                        </label>
                        <label className="flex items-center">
                          <input type="radio" name="historyNotificationLayer" value={3} checked={historyLayerId === 3} onChange={() => setHistoryLayerId(3)} className="mr-2" />
                          <span className="text-sm font-medium text-slate-700">Layer 3: Behavior-Responsive</span>
                        </label>
                        <label className="flex items-center">
                          <input type="radio" name="historyNotificationLayer" value={4} checked={historyLayerId === 4} onChange={() => setHistoryLayerId(4)} className="mr-2" />
                          <span className="text-sm font-medium text-slate-700">Test</span>
                        </label>
                      </div>
                    </div>

                    {/* Push Title */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Push Title *</label>
                      <input
                        type="text"
                        value={historyPushTitle}
                        onChange={(e) => setHistoryPushTitle(e.target.value)}
                        placeholder="Enter the push notification title"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Sent At Timestamp */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Sent At Timestamp *</label>
                      <input
                        type="text"
                        value={historySentAt}
                        onChange={(e) => setHistorySentAt(e.target.value)}
                        placeholder="2025-01-15T10:30:00Z"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Copy from Track Results logs (ISO format)</p>
                    </div>

                    {/* Push Body */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Push Body</label>
                      <textarea
                        value={historyPushBody}
                        onChange={(e) => setHistoryPushBody(e.target.value)}
                        placeholder="Enter the push notification body content"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Deep Link */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Deep Link URL</label>
                      <input
                        type="text"
                        value={historyDeepLink}
                        onChange={(e) => setHistoryDeepLink(e.target.value)}
                        placeholder="https://tradeblock.us/..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Audience Description */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Audience Description *</label>
                      <input
                        type="text"
                        value={historyAudienceDescription}
                        onChange={(e) => setHistoryAudienceDescription(e.target.value)}
                        placeholder="e.g., Users with active in last 7 days, min 10 trades"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Convert Button */}
                  <div>
                    <button
                      onClick={handleConvertAudienceToHistory}
                      disabled={!audienceFile || !historyPushTitle || !historyAudienceDescription || !historySentAt || audienceToHistoryLoading}
                      className={`px-6 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                        !audienceFile || !historyPushTitle || !historyAudienceDescription || !historySentAt || audienceToHistoryLoading
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700 shadow-md shadow-green-500/25'
                      }`}
                    >
                      {audienceToHistoryLoading ? 'Converting...' : 'Convert to Historical Records'}
                    </button>
                  </div>

                  {/* Response Display */}
                  {audienceToHistoryResponse && (
                    <div className={`p-4 rounded-lg border ${
                      audienceToHistoryResponse.success 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <h3 className={`font-medium text-sm ${
                        audienceToHistoryResponse.success ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {audienceToHistoryResponse.success ? 'Success!' : 'Error'}
                      </h3>
                      <p className={`text-sm mt-1 ${
                        audienceToHistoryResponse.success ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {audienceToHistoryResponse.message || audienceToHistoryResponse.error}
                      </p>
                      
                      {audienceToHistoryResponse.details && (
                        <div className="mt-3 text-xs space-y-1">
                          {audienceToHistoryResponse.details.insertedRows !== undefined && (
                            <p className="text-green-600">
                              <span className="font-medium">Records created:</span> {audienceToHistoryResponse.details.insertedRows}
                            </p>
                          )}
                          {audienceToHistoryResponse.details.duplicatesSkipped > 0 && (
                            <p className="text-yellow-600">
                              <span className="font-medium">Duplicates skipped:</span> {audienceToHistoryResponse.details.duplicatesSkipped}
                            </p>
                          )}
                          {audienceToHistoryResponse.details.errors && audienceToHistoryResponse.details.errors.length > 0 && (
                            <div className="text-red-600">
                              <p className="font-medium">Errors:</p>
                              <div className="ml-2 space-y-1">
                                {audienceToHistoryResponse.details.errors.map((error: string, index: number) => (
                                  <p key={index}>{error}</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scheduling Modal */}
        {showCreateAutomationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">Create New Automation</h3>
                
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Start with a template, use a custom script, or create a custom automation sequence.
                  </p>
                  
                  {/* Toggle between Templates and Scripts */}
                  <div className="flex border border-gray-200 rounded-lg p-1">
                    <button
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        !showScriptSelector 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                      onClick={() => setShowScriptSelector(false)}
                    >
                      Templates
                    </button>
                    <button
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        showScriptSelector 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                      onClick={() => setShowScriptSelector(true)}
                    >
                      Custom Scripts
                    </button>
                  </div>
                  
                  {!showScriptSelector ? (
                    /* Template Section */
                    <div className="space-y-3">
                    <Button 
                      onClick={() => {
                        setShowCreateAutomationModal(false);
                        handleUseTemplate('onboarding');
                      }}
                      className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-3 rounded-lg font-medium transition-colors text-left"
                    >
                      <div>
                        <div className="font-medium">👋 New User Onboarding</div>
                        <div className="text-xs text-blue-600 mt-1">4 pushes over 7 days</div>
                      </div>
                    </Button>
                    
                    <Button 
                      onClick={() => {
                        setShowCreateAutomationModal(false);
                        handleUseTemplate('retention');
                      }}
                      className="w-full bg-purple-50 hover:bg-purple-100 text-purple-700 px-4 py-3 rounded-lg font-medium transition-colors text-left"
                    >
                      <div>
                        <div className="font-medium">🔄 Re-engagement Campaign</div>
                        <div className="text-xs text-purple-600 mt-1">3 pushes over 14 days</div>
                      </div>
                    </Button>
                    
                    <Button 
                      onClick={() => {
                        setShowCreateAutomationModal(false);
                        handleUseTemplate('feature');
                      }}
                      className="w-full bg-green-50 hover:bg-green-100 text-green-700 px-4 py-3 rounded-lg font-medium transition-colors text-left"
                    >
                      <div>
                        <div className="font-medium">🚀 Feature Announcement</div>
                        <div className="text-xs text-green-600 mt-1">2 pushes over 3 days</div>
                      </div>
                    </Button>
                    </div>
                  ) : (
                    /* Script-Based Automation Flow */
                    <div className="space-y-4">
                      {/* Step Progress Indicator */}
                      <div className="flex items-center space-x-2 mb-4">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          scriptAutomationStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                        }`}>1</div>
                        <div className={`h-0.5 w-6 ${scriptAutomationStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          scriptAutomationStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                        }`}>2</div>
                        <div className={`h-0.5 w-6 ${scriptAutomationStep >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          scriptAutomationStep >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                        }`}>3</div>
                        <div className="ml-2 text-sm text-gray-600">
                          {scriptAutomationStep === 1 ? 'Select Script' : 
                           scriptAutomationStep === 2 ? 'Configure Schedule' : 'Draft Push Content'}
                        </div>
                      </div>
                      
                      {scriptAutomationStep === 1 ? (
                        /* Step 1: Script Selection */
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Select Audience Generation Script
                            </label>
                            <select
                              value={selectedScript}
                              onChange={(e) => setSelectedScript(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">Choose a script...</option>
                              {availableScripts.map((script) => (
                                <option key={script.id} value={script.id}>
                                  {script.name} ({script.category})
                                </option>
                              ))}
                            </select>
                          </div>
                          
                          {selectedScript && (
                            <div className="bg-gray-50 rounded-lg p-3">
                              <h4 className="text-sm font-medium text-gray-800 mb-1">Script Details</h4>
                              {(() => {
                                const script = availableScripts.find(s => s.id === selectedScript);
                                return script ? (
                                  <div className="text-xs text-gray-600 space-y-1">
                                    <p><strong>Description:</strong> {script.description}</p>
                                    <p><strong>Estimated Runtime:</strong> {script.estimatedRuntime}s</p>
                                    <p><strong>Last Modified:</strong> {new Date(script.lastModified).toLocaleDateString()}</p>
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          )}
                          
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-sm text-blue-800">
                              <strong>Note:</strong> Script-based automations will run your selected script at the scheduled time to generate the audience, then send push notifications to that audience automatically.
                            </p>
                          </div>
                        </div>
                      ) : scriptAutomationStep === 2 ? (
                        /* Step 2: Automation Configuration */
                        <div className="space-y-4">
                          {/* Automation Name */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Automation Name *
                            </label>
                            <input
                              type="text"
                              value={scriptAutomationConfig.name}
                              onChange={(e) => setScriptAutomationConfig(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="e.g., Daily Showcase Push for Jordan 1"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          
                          {/* Schedule Configuration */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Frequency
                              </label>
                              <select
                                value={scriptAutomationConfig.frequency}
                                onChange={(e) => setScriptAutomationConfig(prev => ({ 
                                  ...prev, 
                                  frequency: e.target.value as 'once' | 'daily' | 'weekly' 
                                }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="once">One-time</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Time
                              </label>
                              <input
                                type="time"
                                value={scriptAutomationConfig.executionTime}
                                onChange={(e) => setScriptAutomationConfig(prev => ({ 
                                  ...prev, 
                                  executionTime: e.target.value 
                                }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          </div>
                          
                          {scriptAutomationConfig.frequency === 'once' && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Date
                              </label>
                              <input
                                type="date"
                                value={scriptAutomationConfig.scheduledDate}
                                min={new Date().toISOString().split('T')[0]}
                                onChange={(e) => setScriptAutomationConfig(prev => ({ 
                                  ...prev, 
                                  scheduledDate: e.target.value 
                                }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          )}
                          
                          {/* Show selected script info */}
                          {(() => {
                            const script = availableScripts.find(s => s.id === selectedScript);
                            return script ? (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h4 className="text-sm font-medium text-blue-800 mb-2">Selected Script: {script.name}</h4>
                                <p className="text-sm text-blue-700 mb-2">{script.description}</p>
                                <p className="text-xs text-blue-600">
                                  Will generate {script.audiences?.length || 1} different audiences, each requiring custom push content in the next step.
                                </p>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      ) : (
                        /* Step 3: Push Content Creation */
                        <div className="space-y-4">
                          {(() => {
                            const script = availableScripts.find(s => s.id === selectedScript);
                            if (!script || !script.audiences) return null;
                            
                            return (
                              <>
                                {/* Audience Progress */}
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-medium text-gray-800">
                                      Push {currentPushIndex + 1} of {script.audiences.length}
                                    </h4>
                                    <div className="flex space-x-1">
                                      {script.audiences.map((_: any, index: number) => (
                                        <button
                                          key={index}
                                          onClick={() => setCurrentPushIndex(index)}
                                          className={`w-6 h-6 rounded-full text-xs font-medium ${
                                            index === currentPushIndex
                                              ? 'bg-blue-600 text-white'
                                              : index < currentPushIndex || (scriptPushContents[index]?.title && scriptPushContents[index]?.body)
                                              ? 'bg-green-100 text-green-700'
                                              : 'bg-gray-200 text-gray-500'
                                          }`}
                                        >
                                          {index + 1}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <p className="text-sm text-gray-600">
                                    <strong>Audience:</strong> {script.audiences[currentPushIndex]?.description}
                                  </p>
                                </div>
                                
                                {/* Push Content Form */}
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      Push Title *
                                    </label>
                                    <input
                                      type="text"
                                      value={scriptPushContents[currentPushIndex]?.title || ''}
                                      onChange={(e) => {
                                        const newContents = [...scriptPushContents];
                                        if (newContents[currentPushIndex]) {
                                          newContents[currentPushIndex].title = e.target.value;
                                          setScriptPushContents(newContents);
                                        }
                                      }}
                                      placeholder={`e.g., ${script.audiences[currentPushIndex]?.name === 'haves' ? 'Your sneaker is in demand!' : 
                                                          script.audiences[currentPushIndex]?.name === 'wants' ? 'Your wishlist item is available!' :
                                                          'New trending sneakers just dropped!'}`}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                  </div>
                                  
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      Push Body *
                                    </label>
                                    <textarea
                                      value={scriptPushContents[currentPushIndex]?.body || ''}
                                      onChange={(e) => {
                                        const newContents = [...scriptPushContents];
                                        if (newContents[currentPushIndex]) {
                                          newContents[currentPushIndex].body = e.target.value;
                                          setScriptPushContents(newContents);
                                        }
                                      }}
                                      placeholder={`e.g., ${script.audiences[currentPushIndex]?.name === 'haves' ? 'People are making offers on your sneaker. Check it out!' : 
                                                           script.audiences[currentPushIndex]?.name === 'wants' ? 'Great news - someone is selling the sneaker you want!' :
                                                           'Check out the latest trending sneakers everyone is talking about!'}`}
                                      rows={3}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Deep Link (optional)
                                      </label>
                                      <input
                                        type="text"
                                        value={scriptPushContents[currentPushIndex]?.deepLink || ''}
                                        onChange={(e) => {
                                          const newContents = [...scriptPushContents];
                                          if (newContents[currentPushIndex]) {
                                            newContents[currentPushIndex].deepLink = e.target.value;
                                            setScriptPushContents(newContents);
                                          }
                                        }}
                                        placeholder="app://showcase/haves"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      />
                                    </div>
                                    
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Layer
                                      </label>
                                      <select
                                        value={scriptPushContents[currentPushIndex]?.layerId || 2}
                                        onChange={(e) => {
                                          const newContents = [...scriptPushContents];
                                          if (newContents[currentPushIndex]) {
                                            newContents[currentPushIndex].layerId = parseInt(e.target.value);
                                            setScriptPushContents(newContents);
                                          }
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                                    <div className="flex justify-between pt-4 border-t">
                                      <Button
                                        onClick={() => setCurrentPushIndex(Math.max(0, currentPushIndex - 1))}
                                        disabled={currentPushIndex === 0}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                                      >
                                        ← Previous Push
                                      </Button>
                                      <Button
                                        onClick={() => setCurrentPushIndex(Math.min(script.audiences.length - 1, currentPushIndex + 1))}
                                        disabled={currentPushIndex === script.audiences.length - 1}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                                      >
                                        Next Push →
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <Button 
                    onClick={() => {
                      if (showScriptSelector && scriptAutomationStep > 1) {
                        // Back to previous step
                        setScriptAutomationStep(scriptAutomationStep - 1);
                      } else {
                        // Cancel completely
                        setShowCreateAutomationModal(false);
                        setSelectedScript('');
                        setScriptParameters({});
                        setShowScriptSelector(false);
                        setScriptAutomationStep(1);
                        setScriptPushContents([]);
                        setCurrentPushIndex(0);
                      }
                    }}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    {showScriptSelector && scriptAutomationStep > 1 ? 'Back' : 'Cancel'}
                  </Button>
                  
                  {showScriptSelector ? (
                    scriptAutomationStep === 1 ? (
                      <Button 
                        onClick={() => {
                          if (selectedScript) {
                            const script = availableScripts.find(s => s.id === selectedScript);
                            if (script) {
                              // Initialize automation name if not set
                              if (!scriptAutomationConfig.name) {
                                setScriptAutomationConfig(prev => ({
                                  ...prev,
                                  name: `Daily ${script.name}`
                                }));
                              }
                              // Initialize push contents for all audiences
                              initializePushContents(script);
                            }
                            setScriptAutomationStep(2);
                          }
                        }}
                        disabled={!selectedScript}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                          selectedScript 
                            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Next: Configure Schedule
                      </Button>
                    ) : scriptAutomationStep === 2 ? (
                      <Button 
                        onClick={() => {
                          setScriptAutomationStep(3);
                        }}
                        disabled={!scriptAutomationConfig.name}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                          scriptAutomationConfig.name
                            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Next: Draft Content
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleCreateScriptAutomation}
                        disabled={!scriptAutomationConfig.name || scriptPushContents.some(push => !push.title || !push.body)}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                          scriptAutomationConfig.name && scriptPushContents.every(push => push.title && push.body)
                            ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Create Automation
                      </Button>
                    )
                  ) : (
                    <Button 
                      onClick={() => {
                        setShowCreateAutomationModal(false);
                        setResponse({
                          success: false,
                          message: 'Custom automation builder coming soon! Use a template or script for now.'
                        });
                      }}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      Custom Builder
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {showScheduleModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4 text-gray-800">Schedule Push Notification</h3>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="schedule_date" className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <Input
                    id="schedule_date"
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="schedule_time" className="block text-sm font-medium text-gray-700 mb-1">
                    Time
                  </label>
                  <Input
                    id="schedule_time"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    required
                  />
                </div>

                {savedAudienceCriteria && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-sm font-medium text-blue-800">Audience:</p>
                    <p className="text-sm text-blue-700">{savedAudienceDescription}</p>
                  </div>
                )}

                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-sm font-medium text-gray-800">Notification Preview:</p>
                  <p className="text-sm text-gray-700 mt-1"><strong>{title}</strong></p>
                  <p className="text-sm text-gray-600">{body}</p>
                  {deepLink && (
                    <p className="text-xs text-blue-600 mt-1">→ {deepLink}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3 mt-6">
                <Button
                  type="button"
                  onClick={handleScheduleSubmit}
                  disabled={isLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500"
                >
                  {isLoading ? 'Scheduling...' : 'Schedule It!'}
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  disabled={isLoading}
                  className="flex-1 bg-gray-600 hover:bg-gray-500"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </main>
  );
}
