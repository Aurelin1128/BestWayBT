/**
 * @file RouteTimeline.tsx
 * @description 國道客運 9025 & 9025A 去回程全站時間軸即時看板。
 * @author Antigravity
 * 
 * 設計說明：
 * 1. 允許使用者選擇「9025」或「9025A」客運路線，並切換「去程 (往台北松山機場)」與「回程 (往中壢)」方向。
 * 2. 以美觀的垂直時間軸 (Vertical Timeline) 展示該路線沿途所有停靠站牌。
 * 3. 實作本地每秒倒數遞減邏輯，並配合 API 9秒同步進行時間校準。
 * 4. 針對不同的到站時間與站牌狀態提供清晰的視覺配色。
 */

import React, { useState, useEffect } from 'react';
import type { RouteTimelineStop } from '../types';
import { get9025Timeline } from '../services/tdxService';
import { RefreshCw, Navigation, Compass } from 'lucide-react';

export const RouteTimeline: React.FC = () => {
  const [selectedRoute, setSelectedRoute] = useState<'9025' | '9025A'>('9025');
  const [selectedDirection, setSelectedDirection] = useState<number>(0); // 0: 去程 (中壢➔松山), 1: 回程 (松山➔中壢)
  const [stops, setStops] = useState<RouteTimelineStop[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  /**
   * 業務邏輯：向 TDX 載入當前選定路線與方向的即時 Timeline 動態。
   */
  const loadTimelineData = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setErrorMsg('');
    try {
      const timelineData = await get9025Timeline(selectedRoute, selectedDirection);
      setStops(timelineData);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || '無法獲取國道客運即時資訊，請檢查 TDX 設定。');
    } finally {
      setIsLoading(false);
    }
  };

  // 當選定路線、方向改變時，重新讀取 API 資料
  useEffect(() => {
    loadTimelineData(true);
  }, [selectedRoute, selectedDirection]);

  // 業務邏輯：國道客運動態變更頻率設定為每 30 秒更新一次即可，降低 API 呼叫額度，避免 429
  useEffect(() => {
    let timelineTimer = 30;
    const interval = setInterval(() => {
      timelineTimer -= 1;
      if (timelineTimer <= 0) {
        loadTimelineData(false);
        timelineTimer = 30;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedRoute, selectedDirection]);

  // 業務邏輯：前端每秒自動遞減倒數，為使用者提供精確到秒的即時動態體驗。
  useEffect(() => {
    const timer = setInterval(() => {
      setStops(prevStops =>
        prevStops.map(stop => {
          if (stop.estimateTime !== undefined && stop.estimateTime > 0) {
            return { ...stop, estimateTime: stop.estimateTime - 1 };
          }
          return stop;
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  /**
   * 格式化站點到站狀態
   */
  const formatStopStatus = (stop: RouteTimelineStop) => {
    if (stop.stopStatus === 1) {
      if (stop.nextBusTime) {
        try {
          const time = new Date(stop.nextBusTime);
          const hh = String(time.getHours()).padStart(2, '0');
          const mm = String(time.getMinutes()).padStart(2, '0');
          return `未發車 (${hh}:${mm})`;
        } catch {
          return '未發車';
        }
      }
      return '未發車';
    }
    if (stop.stopStatus === 2) return '交管不停靠';
    if (stop.stopStatus === 3) return '末班車已過';
    if (stop.stopStatus === 4) return '今日未營運';

    if (stop.estimateTime === undefined || stop.estimateTime < 0) {
      return '已過站';
    }

    if (stop.estimateTime <= 60) {
      return '即將進站';
    }

    const mins = Math.floor(stop.estimateTime / 60);
    return `${mins} 分鐘`;
  };

  /**
   * 依據到站秒數回傳適當的顏色 class
   */
  const getEtaClass = (stop: RouteTimelineStop) => {
    if (stop.stopStatus !== 0) return 'timeline-disabled';
    if (stop.estimateTime === undefined || stop.estimateTime < 0) return 'timeline-passed';
    
    if (stop.estimateTime <= 180) return 'timeline-danger';  // 3分鐘內：紅色
    if (stop.estimateTime <= 420) return 'timeline-warning'; // 3-7分鐘：橘色
    return 'timeline-safe';                                // >7分鐘：綠色
  };

  return (
    <div className="route-timeline-panel">
      {/* 頂部切換選單 */}
      <div className="timeline-controls">
        <div className="tab-group">
          <button
            className={`tab-btn ${selectedRoute === '9025' ? 'tab-active' : ''}`}
            onClick={() => setSelectedRoute('9025')}
          >
            9025 客運
          </button>
          <button
            className={`tab-btn ${selectedRoute === '9025A' ? 'tab-active' : ''}`}
            onClick={() => setSelectedRoute('9025A')}
          >
            9025A (繞大)
          </button>
        </div>

        <div className="direction-toggle-group">
          <button
            className={`dir-btn ${selectedDirection === 0 ? 'dir-active' : ''}`}
            onClick={() => setSelectedDirection(0)}
          >
            <Navigation size={14} className="dir-icon" />
            去程 (往松山機場)
          </button>
          <button
            className={`dir-btn ${selectedDirection === 1 ? 'dir-active' : ''}`}
            onClick={() => setSelectedDirection(1)}
          >
            <Compass size={14} className="dir-icon" />
            回程 (往中壢)
          </button>
        </div>
      </div>

      {/* 錯誤警告 */}
      {errorMsg && <div className="timeline-error">{errorMsg}</div>}

      {/* 時間軸展示區 */}
      <div className="timeline-scroll-container">
        {isLoading && stops.length === 0 ? (
          <div className="loading-container">
            <RefreshCw className="animate-spin" size={24} />
            <span>載入路線站牌與即時資訊中...</span>
          </div>
        ) : stops.length === 0 ? (
          <div className="no-data-msg">未取得路線站點，請確認 API 金鑰設定。</div>
        ) : (
          <div className="vertical-timeline">
            {stops.map((stop, index) => {
              const etaClass = getEtaClass(stop);
              const statusText = formatStopStatus(stop);
              const isBusApproaching = stop.stopStatus === 0 && stop.estimateTime !== undefined && stop.estimateTime <= 60 && stop.estimateTime >= 0;

              return (
                <div key={`${stop.stopUID}-${index}`} className="timeline-node">
                  {/* 左側：到站時間/狀態 */}
                  <div className={`timeline-time ${etaClass}`}>
                    {statusText}
                  </div>

                  {/* 中間：時間軸線與圓點 */}
                  <div className="timeline-rail">
                    <div className={`timeline-dot ${etaClass} ${isBusApproaching ? 'pulse-danger' : ''}`}>
                      {index + 1}
                    </div>
                    {index < stops.length - 1 && <div className="timeline-line"></div>}
                  </div>

                  {/* 右側：站牌名稱 */}
                  <div className={`timeline-stop-name ${stop.estimateTime !== undefined && stop.estimateTime < 0 ? 'text-passed' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{stop.stopName}</span>
                    {stop.plateNumb && stop.stopStatus === 0 && stop.estimateTime !== undefined && stop.estimateTime >= 0 && (
                      <span className="plate-badge" style={{ fontSize: '11px', background: 'rgba(255, 255, 255, 0.08)', color: 'rgba(255,255,255,0.6)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                        🚌 {stop.plateNumb}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
