/**
 * @file App.tsx
 * @description 通勤決策助手的主畫面元件，處理全站狀態管理、定時器、API 定時重新整理與智慧轉乘邏輯計算。
 * @author Antigravity
 * 
 * 設計說明：
 * 1. 狀態管理：管理目前系統時間、API 9秒更新倒數、公車即時資料、台鐵即時資料、選定的公車，以及計算出的高亮火車班次。
 * 2. 認證防護：在載入時檢查 localstorage 是否有 credentials。若無，則強制顯示 SettingsModal。
 * 3. 定時器機制：
 *    - 每秒鐘更新 currentTime，並對 refreshTimer 進行遞減。
 *    - 當 refreshTimer 到達 0 時，呼叫 API 更新資料，並將計時器重設為 9。
 * 4. 業務邏輯 - 轉乘推薦：當使用者選定公車班次後，自動計算預期抵達火車站的時間，並與最近五筆台鐵車次進行比對，標註最佳推薦 (5-25分鐘等待時間)、時間緊迫 (<5分鐘) 或無法趕上。
 */

import { useState, useEffect } from 'react';
import './App.css';
import { GlassCard } from './components/GlassCard';
import { SettingsModal } from './components/SettingsModal';
import { BusBoard } from './components/BusBoard';
import { TrainBoard } from './components/TrainBoard';
import { RouteTimeline } from './components/RouteTimeline';
import { getSavedConfig, getFutaiBusETA, getTrainTimetableAndDelay } from './services/tdxService';
import type { BusEstimatedTime, CombinedTrainInfo, TDXConfig } from './types';
import { Train, Settings, Clock, AlertTriangle, RefreshCw } from 'lucide-react';



export default function App() {
  // --- 狀態宣告 ---
  const [config, setConfig] = useState<TDXConfig | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [forceConfig, setForceConfig] = useState(false);

  // 資料狀態
  const [busEtas, setBusEtas] = useState<BusEstimatedTime[]>([]);
  const [trains, setTrains] = useState<CombinedTrainInfo[]>([]);
  const [trainDirection, setTrainDirection] = useState<'go' | 'back'>('go');
  
  // 載入狀態與錯誤訊息
  const [isLoadingBus, setIsLoadingBus] = useState(false);
  const [isLoadingTrain, setIsLoadingTrain] = useState(false);
  const [apiError, setApiError] = useState<string>('');

  // 計時器相關
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [refreshTimer, setRefreshTimer] = useState<number>(30); // 30 秒 API 定時刷新



  // --- 初始化與金鑰檢查 ---
  useEffect(() => {
    const savedConfig = getSavedConfig();
    if (savedConfig && savedConfig.clientId && savedConfig.clientSecret) {
      setConfig(savedConfig);
      loadAllData(savedConfig, 'go');
    } else {
      // 金鑰不存在，強制彈出設定 Modal
      setForceConfig(true);
      setIsSettingsOpen(true);
    }
  }, []);

  // 當台鐵方向切換時，自動重新載入所有資料
  useEffect(() => {
    if (config) {
      loadAllData(config, trainDirection);
    }
  }, [trainDirection]);

  // --- 定時器與 Polling 機制 ---
  // 業務邏輯：
  // 1. 每 1 秒更新目前時間顯示。
  // 2. 每 1 秒 refreshTimer 遞減 1。
  // 3. 當 refreshTimer 歸零，重新向 API 載入最新公車與台鐵時刻，隨後重設倒數為 9 秒。
  useEffect(() => {
    if (!config) return;

    const interval = setInterval(() => {
      setCurrentTime(new Date());

      setRefreshTimer(prev => {
        if (prev <= 1) {
          // 時間到，重新整理資料
          refreshData(trainDirection);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [config, trainDirection]); // selectedBus 作為 dependency 確保重新整理時能利用最新選取狀態



  // --- API 資料載入邏輯 ---

  /**
   * 一一次載入所有即時資料 (用於初始化或手動重刷)
   */
  /**
   * 一一次載入所有即時資料 (用於初始化或手動重刷)
   */
  const loadAllData = async (activeConfig: TDXConfig, direction: 'go' | 'back' = 'go') => {
    if (!activeConfig.clientId) return;
    setApiError('');
    setIsLoadingBus(true);
    setIsLoadingTrain(true);

    try {
      // 併發載入，加速頁面渲染
      const origin = direction === 'go' ? '1100' : '1010';
      const dest = direction === 'go' ? '1010' : '1100';
      console.log(`[DEBUG] loadAllData - direction: ${direction}, origin: ${origin}, dest: ${dest}`);
      const data = await Promise.all([
        getFutaiBusETA(),
        getTrainTimetableAndDelay(origin, dest)
      ]);
      const busData = data[0];
      const trainData = data[1];
      
      const allowedRoutes = ['5026', '5027', '5030', '5031', '5035', '5039', '5027A', '5032', '5033'];
      const filteredBusData = busData.filter(bus => allowedRoutes.includes(bus.routeName));
      setBusEtas(filteredBusData);
      setTrains(trainData);
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || 'API 串接錯誤，請確認金鑰是否有效。');
    } finally {
      setIsLoadingBus(false);
      setIsLoadingTrain(false);
    }
  };

  /**
   * 9秒定時器觸發的輕量刷新 (背景靜默更新，避免載入閃爍)
   */
  const refreshData = async (direction: 'go' | 'back' = 'go') => {
    if (!config) return;
    try {
      const origin = direction === 'go' ? '1100' : '1010';
      const dest = direction === 'go' ? '1010' : '1100';
      console.log(`[DEBUG] refreshData - direction: ${direction}, origin: ${origin}, dest: ${dest}`);
      const [busData, trainData] = await Promise.all([
        getFutaiBusETA(),
        getTrainTimetableAndDelay(origin, dest)
      ]);
      const allowedRoutes = ['5026', '5027', '5030', '5031', '5035', '5039', '5027A', '5032', '5033'];
      const filteredBusData = busData.filter(bus => allowedRoutes.includes(bus.routeName));
      setBusEtas(filteredBusData);
      setTrains(trainData);
    } catch (err) {
      console.error('背景重新整理失敗:', err);
    }
  };

  /**
   * 當設定 Modal 儲存成功時的回呼
   */
  const handleSettingsSaveSuccess = () => {
    const saved = getSavedConfig();
    if (saved) {
      setConfig(saved);
      setForceConfig(false);
      loadAllData(saved);
    }
  };

  // 格式化目前時間顯示 (HH:mm:ss)
  const formattedCurrentTime = currentTime.toTimeString().split(' ')[0];

  return (
    <div className="app-container">
      {/* 頁首 header */}
      <header className="app-header">
        <div className="brand-section">
          <Train className="brand-icon" size={32} />
          <h1 className="brand-title">通勤轉乘智慧決策助手</h1>
        </div>

        <div className="status-control-bar">
          <div className="time-display-wrapper">
            <Clock size={18} className="clock-icon" />
            <span className="clock-text">{formattedCurrentTime}</span>
          </div>

          <div className="refresh-countdown-container">
            <div 
              className="refresh-circle-progress" 
              style={{ transform: `rotate(${(30 - refreshTimer) * 12}deg)` }}
            ></div>
            <span>{refreshTimer} 秒後更新</span>
          </div>

          <button 
            className="btn btn-secondary btn-icon" 
            onClick={() => setIsSettingsOpen(true)}
            title="TDX 金鑰設定"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* 錯誤提示看板 */}
      {apiError && (
        <div className="modal-error-alert" style={{ marginBottom: '0px' }}>
          <AlertTriangle size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
          <span>{apiError}</span>
          <button 
            className="btn btn-secondary" 
            style={{ marginLeft: '16px', padding: '4px 10px', fontSize: '12px' }}
            onClick={() => config && loadAllData(config)}
          >
            重試
          </button>
        </div>
      )}

      {/* 主儀表板區域 */}
      <main className="dashboard-grid">
        {/* ==================== 🚌 公車大類區區 ==================== */}
        <section className="category-section">
          <div className="category-header">
            <span className="category-emoji">🚌</span>
            <h2 className="category-title">市區公車看板</h2>
          </div>
          
          <GlassCard 
            title="富泰公司 公車即時看板" 
            actions={
              <button 
                className="btn btn-secondary" 
                style={{ padding: '6px 12px', fontSize: '13px' }}
                onClick={() => config && loadAllData(config)}
                disabled={isLoadingBus}
              >
                <RefreshCw size={14} className={isLoadingBus ? 'animate-spin' : ''} />
                重新整理
              </button>
            }
          >
            <BusBoard 
              busEtas={busEtas}
              isLoading={isLoadingBus}
              selectedBus={null}
              onSelectBus={() => {}}
            />
          </GlassCard>
        </section>

        {/* ==================== 🚂 台鐵大類區區 ==================== */}
        <section className="category-section">
          <div className="category-header">
            <span className="category-emoji">🚂</span>
            <h2 className="category-title">台鐵火車時刻</h2>
          </div>

          <GlassCard 
            title="台鐵時刻表"
            actions={
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.04)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <button 
                    className={`btn ${trainDirection === 'go' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '4px 10px', fontSize: '12px', border: 'none', borderRadius: '6px', transition: 'all 0.2s' }}
                    onClick={() => setTrainDirection('go')}
                  >
                    上班去程 (中壢➜萬華)
                  </button>
                  <button 
                    className={`btn ${trainDirection === 'back' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '4px 10px', fontSize: '12px', border: 'none', borderRadius: '6px', transition: 'all 0.2s', marginLeft: '2px' }}
                    onClick={() => setTrainDirection('back')}
                  >
                    下班回程 (萬華➜中壢)
                  </button>
                </div>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 12px', fontSize: '13px' }}
                  onClick={() => config && loadAllData(config, trainDirection)}
                  disabled={isLoadingTrain}
                >
                  <RefreshCw size={14} className={isLoadingTrain ? 'animate-spin' : ''} />
                  重新整理
                </button>
              </div>
            }
          >
            <TrainBoard 
              trains={trains}
              isLoading={isLoadingTrain}
              highlightedTrains={[]}
            />
          </GlassCard>
        </section>
      </main>

      {/* ==================== 📌 客運大類區區 ==================== */}
      <section className="category-section timeline-section">
        <div className="category-header">
          <span className="category-emoji">📌</span>
          <h2 className="category-title">國道客運路線</h2>
        </div>

        <GlassCard title="9025 & 9025A 路線各站即時倒數">
          <RouteTimeline />
        </GlassCard>
      </section>

      {/* 設定金鑰彈窗 */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaveSuccess={handleSettingsSaveSuccess}
        forceConfig={forceConfig}
      />
    </div>
  );
}
