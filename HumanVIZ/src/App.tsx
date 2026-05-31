import { useState, useEffect } from "react";
import "./App.scss";
import Dashboard from "./components/Dashboard/Dashboard";
import SplashScreen from "./components/SplashScreen/SplashScreen";

const SPLASH_KEY = "humanviz-splash-shown";

function App() {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(SPLASH_KEY)) {
      setShowSplash(true);
    }
  }, []);

  const handleSplashFinish = () => {
    sessionStorage.setItem(SPLASH_KEY, "1");
    setShowSplash(false);
  };

  return (
    <>
      {/* 主界面始终渲染，作为开场动画的背景 */}
      <div id="app" className="liyuan-app">
        <Dashboard />
      </div>

      {/* 卷轴动画浮在主界面之上 */}
      {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
    </>
  );
}

export default App;
