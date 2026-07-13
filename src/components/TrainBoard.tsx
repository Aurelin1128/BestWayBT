/**
 * @file TrainBoard.tsx
 * @description 台鐵最近五筆時刻表與即時誤點資訊看板元件。
 * @author Antigravity
 * 
 * 設計說明：
 * 1. 顯示中壢到萬華的最近五班火車時刻。
 * 2. 標註即時誤點時間：準點顯示綠色，誤點顯示紅色，並顯示預期開車時間。
 * 3. 整合智慧推薦狀態：若有公車與之聯動，此元件會將高亮的車次顯示為「推薦」、「時間緊迫」或「無法趕上」狀態。
 * 4. 針對自強、莒光、區間等不同車種採用不同的背景漸層色，加強視覺引導。
 */

import React from 'react';
import type { CombinedTrainInfo } from '../types';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

interface HighlightedTrain {
  trainNo: string;
  status: 'recommend' | 'tight' | 'impossible';
  statusReason: string;
}

interface TrainBoardProps {
  trains: CombinedTrainInfo[];
  isLoading: boolean;
  highlightedTrains: HighlightedTrain[];
}

export const TrainBoard: React.FC<TrainBoardProps> = ({
  trains,
  isLoading,
  highlightedTrains
}) => {
  // 建立車次與推薦狀態的查找對照 Map
  const highlightMap = new Map<string, HighlightedTrain>();
  highlightedTrains.forEach(item => {
    highlightMap.set(item.trainNo, item);
  });

  /**
   * 根據車種代碼或名稱回傳對應的車種 CSS 標籤類別
   */
  const getTrainTypeBadgeClass = (typeName: string) => {
    if (typeName.includes('自強') || typeName.includes('普悠瑪') || typeName.includes('太魯閣')) {
      return 'badge-express'; // 自強號：深紅漸層
    }
    if (typeName.includes('莒光')) {
      return 'badge-semi-express'; // 莒光號：橘色
    }
    return 'badge-local'; // 區間車/區間快：藍色
  };

  /**
   * 格式化時間 (只保留時分 HH:mm)
   */
  const formatTime = (timeStr: string) => {
    return timeStr.slice(0, 5);
  };

  return (
    <div className="train-board-wrapper">
      {isLoading && trains.length === 0 ? (
        <div className="loading-container">
          <RefreshCw className="animate-spin" size={24} />
          <span>正在更新台鐵即時時刻...</span>
        </div>
      ) : trains.length === 0 ? (
        <div className="no-train-msg">目前沒有合適的台鐵時刻資料</div>
      ) : (
        <div className="train-list">
          {trains.map(train => {
            const highlight = highlightMap.get(train.trainNo);
            const badgeClass = getTrainTypeBadgeClass(train.trainTypeName);
            
            // 決定高亮樣式
            let itemClass = 'train-item';
            if (highlight) {
              if (highlight.status === 'recommend') itemClass += ' train-recommend-glow';
              if (highlight.status === 'tight') itemClass += ' train-tight-glow';
              if (highlight.status === 'impossible') itemClass += ' train-impossible-glow';
            }

            return (
              <div key={train.trainNo} className={itemClass}>
                {/* 列車資訊與車種 */}
                <div className="train-info-col">
                  <span className={`train-type-badge ${badgeClass}`}>
                    {train.trainTypeName}
                  </span>
                  <span className="train-number-text">{train.trainNo} 次</span>
                </div>

                {/* 發車與抵達時間 */}
                <div className="train-time-col">
                  <div className="time-block">
                    <span className="time-label">中壢發車</span>
                    <span className="time-value">{formatTime(train.departureTime)}</span>
                  </div>
                  <div className="time-separator-line"></div>
                  <div className="time-block">
                    <span className="time-label">萬華抵達</span>
                    <span className="time-value">{formatTime(train.arrivalTime)}</span>
                  </div>
                </div>

                {/* 即時延誤狀態 */}
                <div className="train-delay-col">
                  {train.delayTime === 0 ? (
                    <div className="delay-status status-ontime">
                      <CheckCircle size={14} />
                      <span>準點</span>
                    </div>
                  ) : (
                    <div className="delay-status status-delayed">
                      <AlertTriangle size={14} />
                      <span>晚 {train.delayTime} 分</span>
                    </div>
                  )}
                  {train.delayTime > 0 && (
                    <div className="expected-departure-text">
                      預計開開: {train.expectedDeparture}
                    </div>
                  )}
                </div>

                {/* 智慧推薦決策指示區 */}
                {highlight && (
                  <div className={`train-decision-indicator indicator-${highlight.status}`}>
                    <div className="indicator-header">
                      {highlight.status === 'recommend' && '🌟 最佳推薦'}
                      {highlight.status === 'tight' && '⚠️ 時間緊迫'}
                      {highlight.status === 'impossible' && '❌ 無法趕上'}
                    </div>
                    <div className="indicator-reason">
                      {highlight.statusReason}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
