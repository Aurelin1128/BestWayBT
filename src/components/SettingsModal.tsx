/**
 * @file SettingsModal.tsx
 * @description TDX 金鑰設定彈跳視窗元件。
 * @author Antigravity
 * 
 * 設計說明：
 * 1. 為了保障安全性，TDX Client ID 與 Secret 將被儲存在使用者本機的 LocalStorage。
 * 2. 提供顯示/隱藏 Secret 的切換按鈕。
 * 3. 若無設定金鑰，畫面將維持鎖定狀態，強烈提醒使用者設定後方可開始使用本服務。
 * 4. 提供快速前往 TDX 官網註冊的超連結說明。
 */

import React, { useState, useEffect } from 'react';
import { getSavedConfig, saveConfig } from '../services/tdxService';
import { Shield, Eye, EyeOff, Save, ExternalLink } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
  forceConfig?: boolean; // 若為 true，代表必須設定金鑰才能關閉，不顯示關閉按鈕
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaveSuccess,
  forceConfig = false
}) => {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 當 Modal 開啟時，載入目前已儲存的金鑰
  useEffect(() => {
    if (isOpen) {
      const saved = getSavedConfig();
      if (saved) {
        setClientId(saved.clientId || '');
        setClientSecret(saved.clientSecret || '');
      }
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /**
   * 處理儲存事件
   * 業務邏輯：驗證輸入是否為空，若正常則存入 LocalStorage，並觸發重新載入。
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!clientId.trim() || !clientSecret.trim()) {
      setErrorMsg('請完整輸入 Client ID 與 Client Secret！');
      return;
    }

    setIsSaving(true);
    try {
      // 儲存金鑰並嘗試重新獲取 Token 來驗證金鑰是否有效
      saveConfig({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim()
      });

      // 觸發上層回呼函數更新狀態
      onSaveSuccess();
      setIsSaving(false);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || '金鑰儲存或驗證時發生未知錯誤。');
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container glass-card">
        <div className="modal-header">
          <div className="modal-title-wrapper">
            <Shield className="modal-title-icon" size={24} />
            <h3 className="modal-title">TDX API 金鑰設定</h3>
          </div>
          {!forceConfig && (
            <button className="modal-close-btn" onClick={onClose}>
              &times;
            </button>
          )}
        </div>

        <form onSubmit={handleSave} className="modal-form">
          <div className="modal-body">
            <div className="intro-text">
              本服務需要介接交通部 TDX 平台取得即時公車與台鐵時刻資訊。您的金鑰會安全地**儲存在您的個人瀏覽器中 (LocalStorage)**，絕不上傳至任何第三方伺服器。
              <div style={{ marginTop: '8px', color: 'var(--color-warning)', fontSize: '12px', lineHeight: '1.5' }}>
                ⚠️ <strong>重要提醒：</strong> 取得金鑰後，請務必登入 TDX 會員中心填寫<strong>「加值應用/App 網址」</strong>（例如可填寫：<code>http://localhost:5173/</code>）。若未填寫，TDX 伺服器會限制您的資料 API 請求並回傳 HTTP 429 錯誤！
              </div>
              <a 
                href="https://tdx.transportdata.tw/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="tdx-link"
              >
                前往 TDX 平台免費註冊並取得金鑰 <ExternalLink size={14} style={{ display: 'inline', marginLeft: '2px' }} />
              </a>
            </div>

            {errorMsg && <div className="modal-error-alert">{errorMsg}</div>}

            <div className="form-group">
              <label htmlFor="clientId">Client ID</label>
              <input
                id="clientId"
                type="text"
                className="form-input"
                placeholder="請輸入您的 TDX Client ID"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="form-group">
              <label htmlFor="clientSecret">Client Secret</label>
              <div className="password-input-wrapper">
                <input
                  id="clientSecret"
                  type={showSecret ? 'text' : 'password'}
                  className="form-input password-input"
                  placeholder="請輸入您的 TDX Client Secret"
                  value={clientSecret}
                  onChange={e => setClientSecret(e.target.value)}
                  disabled={isSaving}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowSecret(!showSecret)}
                  tabIndex={-1}
                >
                  {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            {!forceConfig && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isSaving}
              >
                取消
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-save"
              disabled={isSaving}
            >
              <Save size={16} />
              {isSaving ? '儲存中...' : '儲存並套用'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
