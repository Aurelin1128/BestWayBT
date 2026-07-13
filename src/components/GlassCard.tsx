/**
 * @file GlassCard.tsx
 * @description 磨砂玻璃 (Glassmorphism) 風格的基礎卡片元件。
 * @author Antigravity
 * 
 * 設計說明：
 * 提供全站統一的磨砂玻璃包裝元件，包含細邊框、陰影以及毛玻璃背景模糊效果。
 * 可以透過 className 傳入自訂的 class 以進行寬度或版面調整。
 */

import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  actions?: React.ReactNode;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', title, actions }) => {
  return (
    <div className={`glass-card ${className}`}>
      {(title || actions) && (
        <div className="glass-card-header">
          {title && <h2 className="glass-card-title">{title}</h2>}
          {actions && <div className="glass-card-actions">{actions}</div>}
        </div>
      )}
      <div className="glass-card-body">
        {children}
      </div>
    </div>
  );
};
