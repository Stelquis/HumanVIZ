import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5200,
    host: "0.0.0.0",
    strictPort: true,
    // 容器环境：使用轮询替代原生文件监听，确保文件变更可被检测
    watch: {
      usePolling: true,
      interval: 1000,
    },
    // 反向代理环境：显式配置 HMR，确保 WebSocket 连接正确
    hmr: {
      protocol: "wss",
      clientPort: 443,
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
});
