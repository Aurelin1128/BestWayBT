/**
 * @file DecisionHelper.tsx
 * @description 智慧通勤與出發決策助手元件。
 * @author Antigravity
 * 
 * 設計說明：
 * 1. 根據使用者在 BusBoard 中選定的公車，自動推算抵達中壢火車站的時間。
 * 2. 顯示計算公式：公車到站時間 + 25分鐘(公車車程) + 5分鐘(步行轉乘) = 預計抵達火車站時間。
 * 3. 根據公車的到站剩餘時間，提供使用者明確的「出門倒數提示」與「出門時間建議」。
 * 4. 明確列出轉乘推薦原因，提供最直觀的通勤指引。
 */

import React from 'react';
import type { BusEstimatedTime, CombinedTrainInfo } from '../types';
import { HelpCircle, AlertCircle, TrendingUp, Compass, Footprints, Clock } from 'lucide-react';

interface HighlightedTrain {
  trainNo: string;
  status: 'recommend' | 'tight' | 'impossible';
  statusReason: string;
}

interface DecisionHelperProps {
  selectedBus: BusEstimatedTime | null;
  trains: CombinedTrainInfo[];
  highlightedTrains: HighlightedTrain[];
}

export const DecisionHelper: React.FC<DecisionHelperProps> = ({
  selectedBus,
  trains,
  highlightedTrains
}) => {
  if (!selectedBus) {
    return (
      <div className="decision-helper-panel empty-state">
        <HelpCircle className="info-icon" size={32} />
        <div className="empty-text">
          <h4>智慧轉乘推薦助手</h4>
          <p>點選上方「往中壢總站（上班去程）」的任一班公車，系統將自動為您估算抵達火車站時間，並為您推薦最適合的台鐵轉乘班次與最佳出門時機！</p>
        </div>
      </div>
    );
  }

  // 1. 計算公車到站剩餘秒數與預計抵達中壢站時間
  const busEtaSeconds = selectedBus.estimateTime ?? 0;
  const busEtaMinutes = Math.floor(busEtaSeconds / 60);

  // 公車抵達 + 25分車程 + 5分步行 = 30分鐘 (1800 秒)
  const totalTransferBufferSeconds = 1800; 
  const totalSecondsToStation = busEtaSeconds + totalTransferBufferSeconds;

  const now = new Date();
  const expectedArrivalDate = new Date(now.getTime() + totalSecondsToStation * 1000);
  
  // 格式化預計抵達火車站時間為 HH:mm
  const arrivalH = String(expectedArrivalDate.getHours()).padStart(2, '0');
  const arrivalM = String(expectedArrivalDate.getMinutes()).padStart(2, '0');
  const arrivalTimeStr = `${arrivalH}:${arrivalM}`;

  // 2. 計算最佳出門候車時間 (預設出發前 2 分鐘出門抵達富泰公司站牌)
  const leaveBufferSeconds = 120; // 2分鐘
  const secondsToLeave = busEtaSeconds - leaveBufferSeconds;
  
  let leaveAdvice = '';
  let leaveTimeStr = '';
  let adviceStatus: 'danger' | 'warning' | 'success' = 'success';

  if (busEtaSeconds <= 120) {
    leaveAdvice = '🚨 公車即將到站！請立刻出門前往富泰公司站牌！';
    adviceStatus = 'danger';
  } else if (busEtaSeconds <= 300) {
    leaveAdvice = '⚠️ 公車預計 2~5 分鐘內抵達，請現在出門準備候車。';
    adviceStatus = 'warning';
  } else {
    const leaveDate = new Date(now.getTime() + secondsToLeave * 1000);
    const lH = String(leaveDate.getHours()).padStart(2, '0');
    const lM = String(leaveDate.getMinutes()).padStart(2, '0');
    leaveTimeStr = `${lH}:${lM}`;
    leaveAdvice = `⏰ 建議出門時間：【${leaveTimeStr}】（預留 2 分鐘步行至站牌時間）`;
    adviceStatus = 'success';
  }

  // 3. 取得推薦的台鐵列車
  const recommendedTrains = highlightedTrains.filter(t => t.status === 'recommend');
  const tightTrains = highlightedTrains.filter(t => t.status === 'tight');

  return (
    <div className="decision-helper-panel active-state">
      <div className="panel-header">
        <TrendingUp className="header-icon" size={20} />
        <h3 className="panel-title">智慧通勤決策建議</h3>
      </div>

      <div className="decision-body">
        {/* 第一部分：公車轉乘公式說明 */}
        <div className="formula-card">
          <div className="bus-selected-info">
            已選取公車: <span className="highlight-bus">{selectedBus.routeName}</span> (往中壢總站)
          </div>
          
          <div className="formula-steps">
            <div className="step-item">
              <Clock size={16} />
              <span>公車預估到站：<strong>{busEtaMinutes} 分鐘</strong></span>
            </div>
            <div className="step-connector">+</div>
            <div className="step-item">
              <Compass size={16} />
              <span>公車行駛車程：<strong>25 分鐘</strong></span>
            </div>
            <div className="step-connector">+</div>
            <div className="step-item">
              <Footprints size={16} />
              <span>步行至火車站：<strong>5 分鐘</strong></span>
            </div>
          </div>

          <div className="expected-result">
            預計抵達中壢火車站時間：<span className="arrival-time-highlight">{arrivalTimeStr}</span>
          </div>
        </div>

        {/* 第二部分：出門建議看板 */}
        <div className={`advice-alert alert-${adviceStatus}`}>
          <AlertCircle className="alert-icon" size={20} />
          <span className="advice-text">{leaveAdvice}</span>
          {adviceStatus === 'success' && (
            <div className="advice-subtext">
              （距離最晚出門時間還有 {Math.floor(secondsToLeave / 60)} 分 {secondsToLeave % 60} 秒）
            </div>
          )}
        </div>

        {/* 第三部分：推薦台鐵班次摘要 */}
        <div className="recommend-summary">
          <h4 className="summary-title">🚂 轉乘台鐵分析：</h4>
          
          {recommendedTrains.length > 0 ? (
            <div className="rec-trains-list">
              {recommendedTrains.map(rt => {
                const trainDetails = trains.find(t => t.trainNo === rt.trainNo);
                return (
                  <div key={rt.trainNo} className="rec-train-item status-ok">
                    <span className="rec-train-name">
                      {trainDetails?.trainTypeName} {rt.trainNo} 次
                    </span>
                    <span className="rec-train-time">
                      ({trainDetails ? trainDetails.expectedDeparture : ''} 發車)
                    </span>
                    <span className="rec-reason">{rt.statusReason}</span>
                  </div>
                );
              })}
            </div>
          ) : tightTrains.length > 0 ? (
            <div className="warning-msg">
              ⚠️ 沒有完美對齊的推薦班次，但有時間較緊迫的班次：
              {tightTrains.map(tt => {
                const trainDetails = trains.find(t => t.trainNo === tt.trainNo);
                return (
                  <div key={tt.trainNo} className="rec-train-item status-warning">
                    <span>{trainDetails?.trainTypeName} {tt.trainNo} 次</span>
                    <span>({trainDetails ? trainDetails.expectedDeparture : ''} 發車)</span>
                    <span className="rec-reason">{tt.statusReason}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="danger-msg">
              ❌ 很抱歉，目前的公車班次抵達火車站後，最近五班台鐵班次皆已發車或無法趕上，建議改搭其他公車班次！
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
