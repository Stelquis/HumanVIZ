import React, { useEffect, useRef } from "react";

interface ToastProps {
  message: string;
  visible: boolean;
  onClose: () => void;
  duration?: number;
}

/**
 * Toast — 轻量浮窗提示卡片
 * 自动在 duration 毫秒后消失，支持多次重复触发
 */
const Toast: React.FC<ToastProps> = ({
  message,
  visible,
  onClose,
  duration = 2500,
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(() => {
      onClose();
      timerRef.current = null;
    }, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, duration, onClose]);

  if (!visible) return null;

  return (
    <div className="t4-toast">
      <span className="t4-toast-icon">📌</span>
      <span className="t4-toast-text">{message}</span>
    </div>
  );
};

export default Toast;
