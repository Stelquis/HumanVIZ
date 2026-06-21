import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// Serve data/processed/opera_ribbon_data as /data/opera_ribbon/ in dev,
// and copy to dist during build — avoids symlink issues.
function operaRibbonPlugin() {
  const SRC = path.resolve(__dirname, "data/processed/opera_ribbon_data");
  const URL_PREFIX = "/data/opera_ribbon";
  return {
    name: "opera-ribbon-data",
    configureServer(server: any) {
      server.middlewares.use(URL_PREFIX, (req: any, res: any, next: any) => {
        const file = path.join(SRC, req.url || "");
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.setHeader("Content-Type", "application/json");
          res.end(fs.readFileSync(file, "utf-8"));
        } else {
          next();
        }
      });
    },
    writeBundle(_opts: any, bundle: any) {
      const outDir = path.resolve(__dirname, "dist", "data/opera_ribbon");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      for (const f of fs.readdirSync(SRC)) {
        fs.copyFileSync(path.join(SRC, f), path.join(outDir, f));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), operaRibbonPlugin()],
  server: {
    port: 5200,
    host: "0.0.0.0",
    strictPort: true,
    // 容器环境：使用轮询替代原生文件监听，确保文件变更可被检测
    watch: {
      usePolling: true,
      interval: 1000,
    },
    // HMR 配置：本地开发使用默认值（ws:// 协议，自动检测端口）
    // 若通过反向代理（如 cnb.run）访问，请设置环境变量 VITE_HMR_PROTOCOL=wss 和 VITE_HMR_PORT=443
    hmr: process.env.VITE_HMR_PROTOCOL === "wss"
      ? { protocol: "wss", clientPort: Number(process.env.VITE_HMR_PORT) || 443 }
      : {},
    // 允许本地和反向代理域名访问
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      ".cnb.run",
    ],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
});
