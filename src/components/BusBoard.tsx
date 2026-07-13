/**
 * @file BusBoard.tsx
 * @description 富泰公司公車去回程即時到站看板元件。
 * @author Antigravity
 * 
 * 設計說明：
 * 1. 本看板將所有行經「富泰公司」的市區公車路線分為「去程（往中壢總站，上班用）」與「回程（往新屋方向，回家用）」兩個欄位。
 * 2. 為了提供即時且流暢的倒數體驗，本元件內部實作每秒遞減 1 秒的計時器，並在外部 API 資料更新時進行校準。
 * 3. 根據到站秒數呈現不同顏色提示：< 3分鐘 (紅色脈衝閃爍)、3~7分鐘 (亮橘色)、> 7分鐘 (綠色)。
 * 4. 支援點選特定公車班次，並透過 callback 將選取的公車資訊回傳，與台鐵時刻表進行轉乘推薦連動。
 */

import React, { useState, useEffect } from 'react';
import type { BusEstimatedTime } from '../types';
import { Briefcase, Home, RefreshCw } from 'lucide-react';

interface BusBoardProps {
  busEtas: BusEstimatedTime[];
  isLoading: boolean;
  selectedBus: BusEstimatedTime | null;
  onSelectBus: (bus: BusEstimatedTime | null) => void;
}

export const BusBoard: React.FC<BusBoardProps> = ({
  busEtas,
  isLoading,
  selectedBus,
  onSelectBus
}) => {
  const [localEtas, setLocalEtas] = useState<BusEstimatedTime[]>([]);

  // 業務邏輯：當外部 API 重新整理獲得最新數據時，重新同步本地狀態以進行時間校準。
  useEffect(() => {
    setLocalEtas(busEtas);
  }, [busEtas]);

  // 業務邏輯：前端每秒自動遞減倒數，不需要頻繁請求 API 即可維持流暢倒數效果。
  useEffect(() => {
    const timer = setInterval(() => {
      setLocalEtas(prevEtas =>
        prevEtas.map(eta => {
          if (eta.estimateTime !== undefined && eta.estimateTime > 0) {
            return { ...eta, estimateTime: eta.estimateTime - 1 };
          }
          return eta;
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 業務邏輯：輔助排序函數。將倒數進站中的公車優先置頂（按時間近至遠），未發車有發車時間者排中間，末班車已過等無效狀態排在最下方。
  const sortBuses = (buses: BusEstimatedTime[]) => {
    return [...buses].sort((a, b) => {
      const getPriority = (bus: BusEstimatedTime) => {
        // 倒數進站中 (有倒數時間，且 stopStatus 為 0)
        if (bus.stopStatus === 0 && bus.estimateTime !== undefined && bus.estimateTime >= 0) {
          return 3; 
        }
        // 未發車但有發車時間
        if (bus.stopStatus === 1 && bus.nextBusTime) {
          return 2;
        }
        // 其它視為最低優先級 (交管不停靠/末班車已過/今日未營運/已過站等)
        return 1;
      };

      const priorityA = getPriority(a);
      const priorityB = getPriority(b);

      if (priorityA !== priorityB) {
        return priorityB - priorityA; // 優先級高的排在上面
      }

      // 二級排序：
      if (priorityA === 3) {
        // 均為進站倒數中：時間由近到遠排序
        return (a.estimateTime ?? 0) - (b.estimateTime ?? 0);
      }

      if (priorityA === 2) {
        // 均為未發車：按發車時間由早到晚
        const timeA = new Date(a.nextBusTime ?? 0).getTime();
        const timeB = new Date(b.nextBusTime ?? 0).getTime();
        return timeA - timeB;
      }

      // 最低優先級（如末班車已過）：按路線名稱排序
      return a.routeName.localeCompare(b.routeName, undefined, { numeric: true });
    });
  };

  // 業務邏輯：依據桃園客運中壢至新屋路線規則：
  // 去程 (Direction = 0) 代表從中壢發車往新屋/下北湖 (回家回程)
  // 回程 (Direction = 1) 代表從偏鄉回中壢總站 (上班去程)
  const inboundBuses = sortBuses(localEtas.filter(eta => eta.direction === 1)); // 往中壢總站 (上班)
  const outboundBuses = sortBuses(localEtas.filter(eta => eta.direction === 0)); // 往偏鄉方向 (下班)

  /**
   * 格式化剩餘到站秒數為易讀格式
   */
  const formatCountdown = (eta: BusEstimatedTime) => {
    if (eta.stopStatus === 1) {
      // 未發車，解析 nextBusTime (格式一般為 ISO 8601，如 "2026-07-13T19:30:00+08:00")
      if (eta.nextBusTime) {
        try {
          const time = new Date(eta.nextBusTime);
          const hh = String(time.getHours()).padStart(2, '0');
          const mm = String(time.getMinutes()).padStart(2, '0');
          return `未發車 (${hh}:${mm})`;
        } catch {
          return '未發車';
        }
      }
      return '未發車';
    }
    if (eta.stopStatus === 2) return '交管不停靠';
    if (eta.stopStatus === 3) return '末班車已過';
    if (eta.stopStatus === 4) return '今日未營運';

    if (eta.estimateTime === undefined || eta.estimateTime < 0) {
      return '已過站';
    }

    if (eta.estimateTime <= 60) {
      return '即將進站';
    }

    const mins = Math.floor(eta.estimateTime / 60);
    return `${mins} 分鐘`;
  };

  /**
   * 依據到站秒數回傳適當的樣式類別名稱
   */
  const getStatusClass = (eta: BusEstimatedTime) => {
    if (eta.stopStatus !== 0) return 'status-disabled';
    if (eta.estimateTime === undefined || eta.estimateTime < 0) return 'status-passed';
    
    if (eta.estimateTime <= 180) return 'status-danger';  // 3分鐘內：紅色脈衝
    if (eta.estimateTime <= 420) return 'status-warning'; // 3-7分鐘：橘色
    return 'status-safe';                                // >7分鐘：綠色
  };

  /**
   * 點選/取消點選公車卡片
   */
  const handleCardClick = (bus: BusEstimatedTime) => {
    if (bus.stopStatus !== 0 || bus.estimateTime === undefined || bus.estimateTime < 0) {
      // 若非正常班次或已過站，不支援選取
      return;
    }

    if (selectedBus?.routeUID === bus.routeUID && selectedBus?.direction === bus.direction && selectedBus?.stopSequence === bus.stopSequence) {
      // 重複點選則取消選取
      onSelectBus(null);
    } else {
      onSelectBus(bus);
    }
  };

  const renderBusList = (list: BusEstimatedTime[], title: string, isWorkDirection: boolean) => {
    return (
      <div className="bus-column">
        <div className="bus-column-header">
          {isWorkDirection ? (
            <Briefcase size={20} className="column-icon work-icon" />
          ) : (
            <Home size={20} className="column-icon home-icon" />
          )}
          <h3 className="bus-column-title">{title}</h3>
        </div>

        {list.length === 0 ? (
          <div className="no-bus-msg">目前無公車即時到站資訊</div>
        ) : (
          <div className="bus-list">
            {list.map(bus => {
              const isSelected = 
                selectedBus?.routeUID === bus.routeUID && 
                selectedBus?.direction === bus.direction &&
                selectedBus?.stopSequence === bus.stopSequence;
              const statusClass = getStatusClass(bus);
              const formattedTime = formatCountdown(bus);
              
              // 只有正常可以搭乘的車次才顯示指引箭頭 cursor
              const canSelect = bus.stopStatus === 0 && bus.estimateTime !== undefined && bus.estimateTime >= 0;

              return (
                <div
                  key={`${bus.routeUID}-${bus.direction}-${bus.stopSequence}`}
                  className={`bus-item-card ${isSelected ? 'active-glow' : ''} ${!canSelect ? 'card-disabled' : ''}`}
                  onClick={() => canSelect && handleCardClick(bus)}
                  style={{ cursor: canSelect ? 'pointer' : 'default' }}
                >
                  <div className="bus-item-header">
                    <span className="bus-route-number">{bus.routeName}</span>
                    <span className="bus-dest-name">
                      {isWorkDirection ? '往 中壢總站' : '往 新屋/偏鄉'}
                    </span>
                  </div>

                  <div className="bus-item-status-wrapper">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span className={`bus-countdown ${statusClass}`}>
                        {formattedTime}
                      </span>
                      {bus.plateNumb && bus.stopStatus === 0 && bus.estimateTime !== undefined && bus.estimateTime >= 0 && (
                        <span className="plate-badge" style={{ fontSize: '11px', background: 'rgba(255, 255, 255, 0.08)', color: 'rgba(255,255,255,0.6)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                          🚌 {bus.plateNumb}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <span className="selected-badge">已選取轉乘</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bus-board-wrapper">
      {isLoading && localEtas.length === 0 ? (
        <div className="loading-container">
          <RefreshCw className="animate-spin" size={24} />
          <span>正在獲取公車即時動態...</span>
        </div>
      ) : (
        <div className="bus-columns-container">
          {renderBusList(inboundBuses, '往中壢總站 (上班去程)', true)}
          <div className="column-separator"></div>
          {renderBusList(outboundBuses, '往新屋/偏鄉方向 (下班回程)', false)}
        </div>
      )}
    </div>
  );
};
