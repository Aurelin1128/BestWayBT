/**
 * @file index.ts
 * @description 通勤助理系統的 TypeScript 型別定義檔
 * @author Antigravity
 * 
 * 設計說明：
 * 本檔案定義了整個系統所需的資料模型，包含：
 * 1. TDX API 憑證設定的型別 (TDXConfig)
 * 2. 公車/客運的即時到站與路線資訊型別
 * 3. 台鐵時刻表與即時誤點的型別
 * 4. 決策推薦資訊的型別
 * 
 * 所有型別與欄位均加註繁體中文說明以利後續維護與業務邏輯比對。
 */

/**
 * TDX API 憑證設定
 * 儲存於 LocalStorage，供前端向 TDX OAuth 服務進行 Token 換發
 */
export interface TDXConfig {
  clientId: string;     // TDX 平台的 Client ID
  clientSecret: string; // TDX 平台的 Client Secret
}

/**
 * TDX OAuth2 回傳的 Token 資料結構
 */
export interface TDXTokenResponse {
  access_token: string;  // API 呼叫所使用的 Bearer Token
  expires_in: number;    // Token 有效秒數
  token_type: string;    // Token 類型 (通常為 Bearer)
}

/**
 * 公車/客運預估到站資訊 (N1 資料結構簡化版)
 */
export interface BusEstimatedTime {
  routeUID: string;       // 路線唯一識別碼
  routeID: string;        // 路線代碼
  routeName: string;      // 路線名稱 (例如: "5035", "9025")
  direction: number;      // 去回程類型：0: 去程 (往偏鄉/往台北), 1: 回程 (往中壢總站)
  stopUID: string;        // 站牌唯一識別碼
  stopID: string;         // 站牌代碼
  stopName: string;       // 站牌名稱
  stopSequence: number;   // 站牌在路線上的順序
  stopStatus: number;     // 站牌狀態：0: 正常, 1: 未發車, 2: 交管不停靠, 3: 末班車已過, 4: 今日未營運
  estimateTime?: number;  // 預估到站時間 (單位：秒)，若未發車或過站可能不存在
  nextBusTime?: string;   // 下一班車預計發車時間 (ISO 8601 格式)
  isLastBus?: boolean;    // 是否為當日末班車
}

/**
 * 台鐵當日時刻表車次資訊 (DailyTrainTimetable O-D 簡化版)
 */
export interface TrainTimetable {
  trainNo: string;            // 車次代碼 (例如: "111")
  trainTypeName: string;      // 車種名稱 (例如: "自強(3000)", "區間車")
  trainTypeCode: string;      // 車種代碼
  departureTime: string;      // 起點站 (中壢) 出發時間 (格式: "HH:mm:ss")
  arrivalTime: string;        // 終點站 (萬華) 到達時間 (格式: "HH:mm:ss")
  tripLine: number;           // 山海線別：0: 不分山海線, 1: 山線, 2: 海線
}

/**
 * 台鐵列車即時延誤資訊 (LiveTrainDelay)
 */
export interface TrainDelay {
  trainNo: string;            // 車次代碼
  delayTime: number;          // 延誤時間 (單位：分鐘，0 表示準點，負值代表提早)
}

/**
 * 合併時刻表與即時誤點後的台鐵資訊
 * 供 UI 顯示最近五筆資料
 */
export interface CombinedTrainInfo extends TrainTimetable {
  delayTime: number;          // 即時誤點時間 (分鐘)
  expectedDeparture: string;  // 加上誤點後的預計發車時間 (格式: "HH:mm")
}

/**
 * 9025 / 9025A 客運路線站牌資訊
 * 用於繪製完整的路線時間軸
 */
export interface BusStopOfRoute {
  stopUID: string;        // 站牌唯一識別碼
  stopName: string;       // 站牌名稱
  stopSequence: number;   // 站牌順序
}

/**
 * 9025 / 9025A 整合路線各站資訊
 * 包含站牌結構以及該站目前的即時預估時間
 */
export interface RouteTimelineStop {
  stopUID: string;        // 站牌唯一識別碼
  stopName: string;       // 站牌名稱
  stopSequence: number;   // 站牌順序
  estimateTime?: number;  // 目前這班車到該站的剩餘秒數 (秒)
  stopStatus: number;     // 站牌狀態 (0: 正常, 1: 未發車, 2: 交管, 3: 末班已過, 4: 未營運)
  nextBusTime?: string;   // 預估下一班車時間 (若未發車)
}

/**
 * 智慧轉乘決策結果
 */
export interface TransferDecision {
  selectedBusName: string;       // 使用者選取的公車路線
  busEtaSeconds: number;         // 公車預計抵達富泰公司的時間
  expectedArrivalAtStation: Date;// 預估到達中壢火車站的日期時間物件
  recommendedTrains: Array<{
    trainNo: string;
    expectedDeparture: Date;
    status: 'recommend' | 'tight' | 'impossible'; // recommend: 推薦, tight: 轉乘緊迫, impossible: 無法趕上
    statusReason: string;
  }>;
}
