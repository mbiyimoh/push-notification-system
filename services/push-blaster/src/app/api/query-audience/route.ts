import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { queryUsers, fetchDataPacks, fetchManualAudienceData, UserData } from '../../../lib/databaseQueries';

interface AudienceFilters {
  lastActiveDays?: number;
  daysSinceLastActive_inactive?: number;
  tradedInLastDays?: number;
  notTradedInLastDays?: number;
  minLifetimeTrades?: number;
  maxLifetimeTrades?: number;
  hasTrustedTrader?: boolean;
  isTrustedTraderCandidate?: boolean | null;
  joinedAfterDate?: string;
}

interface DataPacks {
  topTargetShoe: boolean;
  hottestShoeTraded: boolean;
  hottestShoeTradedLookback?: number;
  hottestShoeOffers: boolean;
  hottestShoeOffersLookback?: number;
}

export async function POST(req: NextRequest) {
  console.log('=== AUDIENCE QUERY API CALLED ===');
  
  try {
    const body = await req.json();
    console.log('Request body:', body);
    
    // Path 1: Split existing CSV into a zip file
    if (body.csvData && body.splitCount) {
      console.log('Splitting CSV into segments...');
      const { csvData, splitCount } = body;
      const zip = new JSZip();

      const lines = csvData.trim().split('\n');
      const header = lines[0];
      const dataRows = lines.slice(1);

      const totalRows = dataRows.length;
      const baseSize = Math.floor(totalRows / splitCount);
      const remainder = totalRows % splitCount;

      let currentIndex = 0;
      for (let i = 0; i < splitCount; i++) {
        const segmentSize = baseSize + (i < remainder ? 1 : 0);
        const segmentRows = dataRows.slice(currentIndex, currentIndex + segmentSize);
        const segmentCsv = [header, ...segmentRows].join('\n');
        
        zip.file(`part-${i + 1}-of-${splitCount}.csv`, segmentCsv);
        currentIndex += segmentSize;
      }

      const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

      return new NextResponse(zipContent, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="audience_segments_${new Date().toISOString().slice(0, 10)}.zip"`,
        },
      });
    }

    // Path 2: Generate new audience CSV from filters
    const {
      lastActiveDays,
      daysSinceLastActive_inactive,
      tradedInLastDays,
      notTradedInLastDays,
      minLifetimeTrades,
      maxLifetimeTrades,
      hasTrustedTrader,
      isTrustedTraderCandidate,
      joinedAfterDate,
      dataPacks,
      manualUserIds
    } = body;
    
    const dataPackOptions: DataPacks = {
      topTargetShoe: dataPacks?.topTargetShoe || false,
      hottestShoeTraded: dataPacks?.hottestShoeTraded || false,
      hottestShoeTradedLookback: dataPacks?.hottestShoeTradedLookback,
      hottestShoeOffers: dataPacks?.hottestShoeOffers || false,
      hottestShoeOffersLookback: dataPacks?.hottestShoeOffersLookback,
    };
    
    let userIds: string[];
    let userData: UserData[];
    
    if (manualUserIds && Array.isArray(manualUserIds) && manualUserIds.length > 0) {
      console.log('Manual audience creation for user IDs:', manualUserIds);
      userIds = manualUserIds;
      userData = await fetchManualAudienceData(userIds, dataPackOptions);
    } else {
      const filters: AudienceFilters = {};
      if (lastActiveDays !== undefined) filters.lastActiveDays = lastActiveDays;
      if (daysSinceLastActive_inactive !== undefined) filters.daysSinceLastActive_inactive = daysSinceLastActive_inactive;
      if (tradedInLastDays !== undefined) filters.tradedInLastDays = tradedInLastDays;
      if (notTradedInLastDays !== undefined) filters.notTradedInLastDays = notTradedInLastDays;
      if (minLifetimeTrades !== undefined) filters.minLifetimeTrades = minLifetimeTrades;
      if (maxLifetimeTrades !== undefined) filters.maxLifetimeTrades = maxLifetimeTrades;
      if (hasTrustedTrader !== undefined) filters.hasTrustedTrader = hasTrustedTrader;
      if (isTrustedTraderCandidate !== undefined) filters.isTrustedTraderCandidate = isTrustedTraderCandidate;
      if (joinedAfterDate) filters.joinedAfterDate = joinedAfterDate;
      
      console.log('Processed filters:', filters);
      userIds = await queryUsers(filters);
      console.log('Found user IDs:', userIds);
      
      if (userIds.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No users found matching the specified criteria.',
          userCount: 0,
          csvData: ''
        });
      }
      
      userData = await fetchDataPacks(userIds, dataPackOptions);
    }
    
    const filteredUsers = userData.filter(user => {
      if (dataPackOptions.topTargetShoe && (!user.top_target_shoe_name || !user.top_target_shoe_variantid)) {
        return false;
      }
      if (dataPackOptions.hottestShoeTraded && (!user.hottest_shoe_traded_name || !user.hottest_shoe_traded_variantid)) {
        return false;
      }
      if (dataPackOptions.hottestShoeOffers && (!user.hottest_shoe_offers_name || !user.hottest_shoe_offers_variantid)) {
        return false;
      }
      return true;
    });
    
    console.log(`Filtered to ${filteredUsers.length} users with complete data`);
    
    const csvFormattedUsers = filteredUsers.map(user => {
      const { id, ...rest } = user;
      return { user_id: id, ...rest };
    });

    const csvData = Papa.unparse(csvFormattedUsers);
    
    let audienceDescription: string;
    if (manualUserIds && Array.isArray(manualUserIds) && manualUserIds.length > 0) {
      audienceDescription = `Manual audience (${manualUserIds.length} user IDs)`;
    } else {
      const filterDescriptions = [];
      if (lastActiveDays) filterDescriptions.push(`active in last ${lastActiveDays} days`);
      if (daysSinceLastActive_inactive) filterDescriptions.push(`NOT active in last ${daysSinceLastActive_inactive} days`);
      if (tradedInLastDays) filterDescriptions.push(`traded in last ${tradedInLastDays} days`);
      if (notTradedInLastDays) filterDescriptions.push(`not traded in last ${notTradedInLastDays} days`);
      if (minLifetimeTrades) filterDescriptions.push(`min ${minLifetimeTrades} lifetime trades`);
      if (maxLifetimeTrades) filterDescriptions.push(`max ${maxLifetimeTrades} lifetime trades`);
      if (hasTrustedTrader) filterDescriptions.push('trusted traders');
      if (isTrustedTraderCandidate === true) {
        filterDescriptions.push('trusted trader candidates');
      } else if (isTrustedTraderCandidate === false) {
        filterDescriptions.push('not trusted trader candidates');
      }
      if (joinedAfterDate) filterDescriptions.push(`joined after ${joinedAfterDate}`);
      
      audienceDescription = `Users with ${filterDescriptions.join(', ')}`;
    }
    
    const packDescriptions = [];
    if (dataPackOptions.topTargetShoe) packDescriptions.push('TOP TARGET SHOE');
    if (dataPackOptions.hottestShoeTraded) {
        packDescriptions.push(`YOUR HOTTEST SHOE - TRADES (Last ${dataPackOptions.hottestShoeTradedLookback || 30} days)`);
    }
    if (dataPackOptions.hottestShoeOffers) {
        packDescriptions.push(`YOUR HOTTEST SHOE - OFFERS (Last ${dataPackOptions.hottestShoeOffersLookback || 7} days)`);
    }
    
    if (packDescriptions.length > 0) {
      audienceDescription += ` + data packs: ${packDescriptions.join(', ')}`;
    }
    
    return NextResponse.json({
      success: true,
      message: `Successfully generated audience CSV with ${filteredUsers.length} users.`,
      userCount: filteredUsers.length,
      csvData,
      audienceDescription
    });
    
  } catch (error: any) {
    console.error('ERROR in query-audience API:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'An internal server error occurred.' 
    }, { status: 500 });
  }
}
