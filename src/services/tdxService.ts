/**
 * @file tdxService.ts
 * @description 串接交通部 TDX 平台 API 的服務層，處理 OAuth2 驗證、公車預估到站、台鐵時刻表及延誤、公路客運站牌與即時資訊。
 * @author Antigravity
 * 
 * 設計說明：
 * 1. 本模組不使用外部大型 HTTP client 庫，直接使用瀏覽器原生 fetch 實作。
 * 2. TDX 認證使用 client_credentials 流程，將 token 快取在記憶體中，並判斷過期時間。
 * 3. 公車使用 v2 API，台鐵時刻表使用 v3 API 以獲得更穩定的資料結構。
 * 4. 提供快取與優化篩選，以最少的 API 呼叫次數完成所需資料的組裝。
 */

import type { TDXConfig, BusEstimatedTime, CombinedTrainInfo, RouteTimelineStop } from '../types';

// 金鑰存取 LocalStorage 的鍵名
const CONFIG_KEY = 'tdx_config_credentials';

// 快取 token 與過期時間 (Epoch 毫秒)
let cachedToken: string | null = null;
let tokenExpireTime: number = 0;
let activeTokenPromise: Promise<string> | null = null;

/**
 * 從 LocalStorage 載入金鑰設定
 */
export function getSavedConfig(): TDXConfig | null {
  try {
    const configStr = localStorage.getItem(CONFIG_KEY);
    if (configStr) {
      return JSON.parse(configStr);
    }
  } catch (e) {
    console.error('無法讀取儲存的 TDX 設定:', e);
  }
  return null;
}

/**
 * 將金鑰設定儲存至 LocalStorage
 */
export function saveConfig(config: TDXConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  // 當金鑰變更時，清除快取的舊 Token
  cachedToken = null;
  tokenExpireTime = 0;
  activeTokenPromise = null;
}

/**
 * 取得 TDX OAuth 2.0 Access Token
 * 業務邏輯：
 * 1. 判斷快取 Token 是否依然有效，若有效則直接回傳。
 * 2. 如果目前已經有一個 token 請求正在進行，直接 await 該 Promise，避免併發請求重複發送 POST 造成 HTTP 429。
 * 3. 若無有效 token 且無進行中之請求，則開啟一個 Promise 鎖並發送 POST 授權。
 */
async function getAccessToken(): Promise<string> {
  const config = getSavedConfig();
  if (!config || !config.clientId || !config.clientSecret) {
    throw new Error('未設定 TDX Client ID 或 Client Secret，請先進行設定。');
  }

  // 提前 30 秒判定過期，確保呼叫 API 時 token 依然有效
  const now = Date.now();
  if (cachedToken && tokenExpireTime > now + 30000) {
    return cachedToken;
  }

  // 業務邏輯：Promise 鎖鎖定，若併發則直接返回現有的 token 請求 Promise
  if (activeTokenPromise) {
    return activeTokenPromise;
  }

  activeTokenPromise = (async () => {
    try {
      // 封裝 x-www-form-urlencoded 格式資料
      const details: Record<string, string> = {
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret
      };

      const formBody = Object.keys(details)
        .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(details[key]))
        .join('&');

      const response = await fetch(
        'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formBody
        }
      );

      if (!response.ok) {
        throw new Error(`TDX 授權失敗 (HTTP ${response.status})，請確認金鑰是否正確。`);
      }

      const data = await response.json();
      cachedToken = data.access_token;
      // 計算過期時間：當前時間 + 有效秒數 * 1000
      tokenExpireTime = Date.now() + data.expires_in * 1000;

      return cachedToken!;
    } finally {
      // 完成或失敗後，釋放 Promise 鎖
      activeTokenPromise = null;
    }
  })();

  return activeTokenPromise;
}

let lastRequestTime = 0;
let lastRequestPromise: Promise<void> = Promise.resolve();

/**
 * 封裝呼叫 TDX API 的基礎 fetch 方法
 * 自動帶入 Bearer Token 並處理錯誤
 * 業務邏輯：防併發過載限流隊列。保證任意兩個 API 請求發送時間至少相隔 250 毫秒，避免 React 初始化併發引起 429。
 */
async function fetchTDX<T>(url: string): Promise<T> {
  const token = await getAccessToken();

  // 取得當前的排隊鎖 (Promise 鏈)
  const currentPromise = lastRequestPromise;
  
  // 建立新的隊列 Promise，不論成功或失敗，皆在 finally 中釋放鎖，讓後續請求得以執行
  let resolveQueue: () => void = () => {};
  lastRequestPromise = new Promise<void>(resolve => {
    resolveQueue = resolve;
  });

  try {
    // 等待前一個請求發送流程結束
    await currentPromise;

    // 限制併發頻率，確保 API 呼叫發送間隔在 250ms 以上
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < 250) {
      const delay = 250 - timeSinceLast;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // 更新發送時間
    lastRequestTime = Date.now();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`TDX API 呼叫失敗 (HTTP ${response.status})。請求網址: ${url}`);
    }

    return await response.json() as T;
  } finally {
    // 釋放鎖，讓下一個排隊請求開始發送
    resolveQueue();
  }
}

/**
 * 取得富泰公司站牌之所有公車即時預估到站時間
 * 業務邏輯：透過 $filter 篩選站牌名稱為「富泰公司」，一次拉回所有行經此站的公車資料，減少呼叫次數。
 */
export async function getFutaiBusETA(): Promise<BusEstimatedTime[]> {
  const url = `https://tdx.transportdata.tw/api/basic/v2/Bus/EstimatedTimeOfArrival/City/Taoyuan?$filter=StopName/Zh_tw eq '富泰公司'&$format=JSON`;
  const rawData = await fetchTDX<any[]>(url);

  // 轉換為我們定義的 BusEstimatedTime 型別
  return rawData.map(item => ({
    routeUID: item.RouteUID,
    routeID: item.RouteID,
    routeName: item.RouteName?.Zh_tw || '',
    direction: item.Direction,
    stopUID: item.StopUID,
    stopID: item.StopID,
    stopName: item.StopName?.Zh_tw || '',
    stopSequence: item.StopSequence,
    stopStatus: item.StopStatus,
    estimateTime: item.EstimateTime,
    nextBusTime: item.NextBusTime,
    isLastBus: item.IsLastBus === 1 || item.IsLastBus === true
  }));
}

// 快取台鐵當天時刻表，Key 為 起點_to_終點，避免重複呼叫，節省 API 額度並降低 429 機率
let cachedTrainTimetable: Record<string, any> = {};
let cachedTimetableDate: string = '';

/**
 * 取得台鐵指定起迄站之最近五筆班次時刻與即時誤點資訊
 * 業務邏輯：
 * 1. 取得今日的 OD 時刻表 (預設中壢 1017 ➔ 萬華 1010，或反向，一天只需取得一次，採 Cache 機制)
 * 2. 取得全台列車的即時誤點資訊 LiveTrainDelay (定時刷新)
 * 3. 篩選出出發時間大於目前時間的班次，並與延誤資訊進行合併
 * 4. 排序並取最近五筆
 */
export async function getTrainTimetableAndDelay(
  originStationID: string = '1017',
  destinationStationID: string = '1010'
): Promise<CombinedTrainInfo[]> {
  const now = new Date();
  
  // 取得今日日期格式為 YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const trainDate = `${year}-${month}-${date}`;

  // 1. 取得今日時刻表（有快取則使用快取，無則呼叫 API）
  const cacheKey = `${originStationID}_to_${destinationStationID}`;
  
  // 若日期跨天，清空快取
  if (cachedTimetableDate !== trainDate) {
    cachedTrainTimetable = {};
    cachedTimetableDate = trainDate;
  }

  let rawTimetable: any;
  if (cachedTrainTimetable[cacheKey]) {
    rawTimetable = cachedTrainTimetable[cacheKey];
  } else {
    const timetableUrl = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/${originStationID}/to/${destinationStationID}/${trainDate}?$format=JSON`;
    rawTimetable = await fetchTDX<any>(timetableUrl);
    cachedTrainTimetable[cacheKey] = rawTimetable;
  }

  // 2. 獲取即時延誤資訊 (v2 版本，因 v3 無此端點)
  const delayUrl = `https://tdx.transportdata.tw/api/basic/v2/Rail/TRA/LiveTrainDelay?$format=JSON`;
  const rawDelay = await fetchTDX<any[]>(delayUrl);

  // 2. 建立誤點的 Map 對照表，方便快速搜尋車次 (TrainNo)
  const delayMap = new Map<string, number>();
  const delayList = Array.isArray(rawDelay) ? rawDelay : [];
  delayList.forEach((item: any) => {
    if (item && item.TrainNo !== undefined) {
      delayMap.set(item.TrainNo, item.DelayTime || 0);
    }
  });

  // 3. 解析時刻表資料
  const trainList = rawTimetable?.TrainTimetables || [];
  const combinedList: CombinedTrainInfo[] = trainList
    .map((item: any) => {
      const trainInfo = item?.TrainInfo || item?.DailyTrainInfo;
      const stopTimes = item?.StopTimes || [];
      const originStop = item?.OriginStopTime || stopTimes.find((s: any) => s.StationID === originStationID);
      const destStop = item?.DestinationStopTime || stopTimes.find((s: any) => s.StationID === destinationStationID);
      
      if (!trainInfo || !originStop || !destStop) {
        return null;
      }
      
      const trainNo = trainInfo.TrainNo;
      if (trainNo === undefined) return null;
      
      const delayTime = delayMap.get(trainNo) || 0;

      // 計算預計出發時間 (加入誤點時間)
      const departureTimeStr = originStop.DepartureTime; // 格式 "HH:mm" 或 "HH:mm:ss"
      if (!departureTimeStr) return null;
      
      const timeParts = departureTimeStr.split(':').map(Number);
      const h = timeParts[0];
      const m = timeParts[1];
      const s = timeParts[2] || 0;
      
      const depDate = new Date();
      depDate.setHours(h, m, s, 0);
      
      // 如果有誤點，加算誤點分鐘數
      if (delayTime > 0) {
        depDate.setMinutes(depDate.getMinutes() + delayTime);
      }
      const expH = String(depDate.getHours()).padStart(2, '0');
      const expM = String(depDate.getMinutes()).padStart(2, '0');
      const expectedDeparture = `${expH}:${expM}`;

      return {
        trainNo: trainNo,
        trainTypeName: trainInfo.TrainTypeName?.Zh_tw || '',
        trainTypeCode: trainInfo.TrainTypeCode || '',
        departureTime: departureTimeStr,
        arrivalTime: destStop.ArrivalTime,
        tripLine: trainInfo.TripLine || 0,
        delayTime: delayTime,
        expectedDeparture: expectedDeparture
      };
    })
    .filter((t: CombinedTrainInfo | null): t is CombinedTrainInfo => t !== null);


  // 4. 篩選出表定或預計出發時間大於現在時間的班次
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const currentSec = now.getSeconds();
  
  const filteredList = combinedList.filter(train => {
    const timeParts = train.departureTime.split(':').map(Number);
    const h = timeParts[0];
    const m = timeParts[1];
    const s = timeParts[2] !== undefined ? timeParts[2] : 0;
    
    // 判斷是否大於目前時間
    if (h > currentHour) return true;
    if (h === currentHour && m > currentMin) return true;
    if (h === currentHour && m === currentMin && s >= currentSec) return true;
    return false;
  });

  // 5. 排序並只保留前 5 筆
  filteredList.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  return filteredList.slice(0, 5);
}

// 暫存公路客運 9025 / 9025A 的站牌順序 (因為站牌結構是不會變的，不需頻繁請求)
let cached9025Stops: { routeName: string; direction: number; stops: { stopUID: string; stopName: string; stopSequence: number }[] }[] = [];

/**
 * 取得 9025 / 9025A 的路線站牌結構 (StopOfRoute)
 * 業務邏輯：如果快取已存在則直接使用，否則向 API 請求。去程 0 代表中壢➔松山機場，回程 1 代表松山機場➔中壢。
 */
export async function get9025Stops(): Promise<{ routeName: string; direction: number; stops: { stopUID: string; stopName: string; stopSequence: number }[] }[]> {
  if (cached9025Stops.length > 0) {
    return cached9025Stops;
  }

  const url = `https://tdx.transportdata.tw/api/basic/v2/Bus/StopOfRoute/InterCity?$filter=RouteName/Zh_tw eq '9025' or RouteName/Zh_tw eq '9025A'&$format=JSON`;
  const rawData = await fetchTDX<any[]>(url);

  cached9025Stops = rawData.map(item => {
    const routeName = item.RouteName?.Zh_tw || '';
    const direction = item.Direction;
    const stopsList = item.Stops || [];
    const stops = stopsList.map((s: any) => ({
      stopUID: s.StopUID,
      stopName: s.StopName?.Zh_tw || '',
      stopSequence: s.StopSequence
    }));

    // 依站牌順序排序
    stops.sort((a: any, b: any) => a.stopSequence - b.stopSequence);

    return {
      routeName,
      direction,
      stops
    };
  });

  return cached9025Stops;
}

/**
 * 取得 9025 / 9025A 的各站即時到站倒數資訊
 * 業務邏輯：
 * 1. 先確認 9025 / 9025A 的站牌結構已加載。
 * 2. 獲取公路客運即時到站 API (EstimatedTimeOfArrival/InterCity)。
 * 3. 將站牌結構與即時預估時間進行 Mapping，組裝成各站點的 Timeline 物件。
 */
export async function get9025Timeline(targetRoute: '9025' | '9025A', direction: number): Promise<RouteTimelineStop[]> {
  // 1. 取得站牌結構
  const allRouteStops = await get9025Stops();
  const currentStopsInfo = allRouteStops.find(
    item => item.routeName === targetRoute && item.direction === direction
  );

  if (!currentStopsInfo) {
    return [];
  }

  // 2. 獲取即時預估到站時間
  const etaUrl = `https://tdx.transportdata.tw/api/basic/v2/Bus/EstimatedTimeOfArrival/InterCity?$filter=(RouteName/Zh_tw eq '${targetRoute}') and (Direction eq ${direction})&$format=JSON`;
  const rawEta = await fetchTDX<any[]>(etaUrl);

  // 3. 建立即時 ETA 的對照表
  const etaMap = new Map<string, { estimateTime?: number; stopStatus: number; nextBusTime?: string }>();
  rawEta.forEach(item => {
    etaMap.set(item.StopUID, {
      estimateTime: item.EstimateTime,
      stopStatus: item.StopStatus,
      nextBusTime: item.NextBusTime
    });
  });

  // 4. 對齊站牌結構，將 ETA 對應至每個站點
  return currentStopsInfo.stops.map(stop => {
    const etaData = etaMap.get(stop.stopUID);
    return {
      stopUID: stop.stopUID,
      stopName: stop.stopName,
      stopSequence: stop.stopSequence,
      estimateTime: etaData?.estimateTime,
      stopStatus: etaData?.stopStatus ?? 1, // 預設 1: 未發車
      nextBusTime: etaData?.nextBusTime
    };
  });
}
