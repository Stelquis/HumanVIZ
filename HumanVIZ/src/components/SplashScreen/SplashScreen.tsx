import { useState, useEffect, useCallback, useRef } from "react";
import "./SplashScreen.scss";

interface SplashScreenProps {
  onFinish: () => void;
}

type Phase = "enter" | "unfurl" | "reveal" | "hold" | "exit";

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [phase, setPhase] = useState<Phase>("enter");
  const exiting = useRef(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("unfurl"), 120);
    const t2 = setTimeout(() => setPhase("reveal"), 1000);
    const t3 = setTimeout(() => setPhase("hold"), 2200);
    const t4 = setTimeout(() => setPhase("exit"), 3400);
    const t5 = setTimeout(() => onFinish(), 4100);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [onFinish]);

  const skip = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    setPhase("exit");
    setTimeout(() => onFinish(), 700);
  }, [onFinish]);

  const isOpen =
    phase === "unfurl" || phase === "reveal" || phase === "hold";
  const isContentVisible = phase === "reveal" || phase === "hold";
  const isHintVisible = phase === "reveal" || phase === "hold";

  return (
    <div
      className={`splash-overlay${phase === "exit" ? " splash--exit" : ""}`}
      onClick={skip}
    >
      <div className="splash-scroll">
        {/* 天杆 — top rod */}
        <div className="scroll-rod scroll-rod--top">
          <div className="scroll-rod-cap scroll-rod-cap--l" />
          <div className="scroll-rod-cap scroll-rod-cap--r" />
        </div>

        {/* 画心 — scroll paper */}
        <div className={`scroll-paper${isOpen ? " scroll-paper--open" : ""}`}>
          <div className="scroll-paper-inner">
            {/* 脸谱底纹 — Guan.png 水印 */}
            <img
              className={`scroll-mask-img${isContentVisible ? " scroll-mask-img--visible" : ""}`}
              src="/Guan.png"
              alt=""
            />

            {/* 脸谱 SVG 轮廓装饰 */}
            <svg
              className={`scroll-mask-svg${isContentVisible ? " scroll-mask-svg--visible" : ""}`}
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
            >
              <path
                d="M35,3 C44,-1 56,-1 65,3 C79,6 84,16 87,28
                   C91,38 90,48 88,54 C84,58 78,61 70,69
                   C62,77 56,83 50,93 C44,83 38,77 30,69
                   C22,61 16,58 12,54 C10,48 9,38 13,28
                   C16,16 21,6 35,3 Z"
                fill="none"
                stroke="rgba(184,155,109,0.28)"
                strokeWidth="0.7"
              />
              <path
                d="M20,21 Q28,18 40,22"
                fill="none" stroke="rgba(150,84,77,0.15)" strokeWidth="0.9" strokeLinecap="round"
              />
              <path
                d="M60,22 Q72,18 80,21"
                fill="none" stroke="rgba(150,84,77,0.15)" strokeWidth="0.9" strokeLinecap="round"
              />
              <ellipse cx="30" cy="29" rx="7.5" ry="5"
                fill="rgba(94,107,118,0.06)" stroke="rgba(184,155,109,0.2)" strokeWidth="0.5"
              />
              <ellipse cx="70" cy="29" rx="7.5" ry="5"
                fill="rgba(94,107,118,0.06)" stroke="rgba(184,155,109,0.2)" strokeWidth="0.5"
              />
              <line x1="50" y1="24" x2="50" y2="55"
                stroke="rgba(184,155,109,0.18)" strokeWidth="0.7"
              />
              <ellipse cx="50" cy="63" rx="12" ry="5.5"
                fill="rgba(150,84,77,0.04)" stroke="rgba(184,155,109,0.2)" strokeWidth="0.5"
              />
            </svg>

            <div className="scroll-paper-deco-top" />
            <div
              className={`scroll-body${isContentVisible ? " scroll-body--visible" : ""}`}
            >
              <h1 className="scroll-title">梨园万象</h1>
              <div className="scroll-divider" />
              <p className="scroll-subtitle">HumanVIZ</p>
              <p className="scroll-desc">京剧人文数据可视化平台</p>
              <div className="scroll-seal">梨园</div>
            </div>
            <div className="scroll-paper-deco-bot" />
          </div>
        </div>

        {/* 地杆 — bottom rod */}
        <div className="scroll-rod scroll-rod--bottom">
          <div className="scroll-rod-cap scroll-rod-cap--l" />
          <div className="scroll-rod-cap scroll-rod-cap--r" />
        </div>
      </div>

      <p
        className={`splash-hint${isHintVisible ? " splash-hint--visible" : ""}`}
      >
        点击任意位置跳过
      </p>
    </div>
  );
};

export default SplashScreen;
