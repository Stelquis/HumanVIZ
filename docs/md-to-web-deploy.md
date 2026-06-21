# 将 Markdown 文档转为可访问网页（CNB 平台）

> **场景：** 有一份 `.md` 格式的复习资料（内嵌 CSS/HTML 元素），希望转成独立 HTML 页面并部署到公网可访问的网址，手机/电脑/平板均可打开。
>
> **平台：** CNB（Cloud Native Base）— 通过 `{{port}}.cnb.run` 形式的端口映射暴露服务。

---

## 一、整体流程

```
.md 源文件
    │
    ▼  (1) 用 marked 转换成 HTML
.html (内嵌 body)
    │
    ▼  (2) 补充完整文档结构（DOCTYPE、meta、head、title）
.html (完整独立页面)
    │
    ▼  (3) 启动静态 HTTP 服务
localhost:PORT
    │
    ▼  (4) CNB 端口映射
https://xxx-PORT.cnb.run/  ← 任意设备可访问
```

---

## 二、核心步骤

### 1. 安装/使用 marked 转换

```bash
# 用 npx 直接执行，无需提前安装
npx marked -o output.html -i input.md
```

**注意：** `marked` 会保留 HTML 标签（`<div>`、`<details>`、`<style>` 等），但原始输出不含完整的 HTML 文档骨架，需要自行包装。

### 2. 补充完整文档结构

用 Node.js 脚本包裹：

```js
const fs = require('fs');
const body = fs.readFileSync('/tmp/body.html', 'utf-8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文档标题</title>
  <style>
    /* 此处内联所有 CSS */
  </style>
</head>
<body>
${body}
</body>
</html>`;

fs.writeFileSync('output.html', html, 'utf-8');
```

**必须包含的 meta 标签：**

| 标签 | 作用 |
|------|------|
| `<meta charset="UTF-8">` | 正确显示中文 |
| `<meta name="viewport" ...>` | 移动端适配 |

### 3. 启动 HTTP 服务

#### 方式 A：Python（最通用，无需安装依赖）

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

- `--bind 0.0.0.0` — 允许外部访问（默认只监听 localhost）
- 运行后会在当前目录提供静态文件服务

#### 方式 B：Node.js（更灵活）

```bash
npx serve . -p 8080
```

#### 方式 C：纯静态后台运行

```bash
# 后台运行
python3 -m http.server 8080 --bind 0.0.0.0 2>&1 &

# 验证
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/你的文件.html
# 返回 200 即成功
```

### 4. 获取访问地址

CNB 平台的端口映射格式：

```
https://<workspace-prefix>-<PORT>.cnb.run/
```

**如何获取前缀：**

```bash
# 查看环境变量
echo $VSCODE_PROXY_URI
# 示例输出: https://lfvfxwjg0p-{{port}}.cnb.run/
```

将 `{{port}}` 替换为实际端口号即可。

**实际示例：**

| 端口 | 访问 URL |
|------|----------|
| 8080 | `https://lfvfxwjg0p-8080.cnb.run/` |
| 3000 | `https://lfvfxwjg0p-3000.cnb.run/` |

> ⚠️ 默认端口号可能在 3000~9999 范围内均可使用，注意避开已占用端口。

---

## 三、注意事项

### 文件路径与 URL 对应关系

服务器以启动目录为根目录，URL 路径对应文件路径：

```
启动目录: /workspace/
文件:      /workspace/Politics/Xi/XiGai.html
访问:      http://localhost:8080/Politics/Xi/XiGai.html
```

### 中文显示

- Markdown 源文件必须保存为 UTF-8 编码
- HTML 必须有 `<meta charset="UTF-8">`
- 建议指定中文字体：`font-family: -apple-system, "Noto Sans SC", "Microsoft YaHei", sans-serif;`

### 移动端适配

在 head 中添加 viewport meta，否则手机浏览器会缩放显示：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

### 打印支持

添加 CSS 打印样式，导出 PDF 时保持卡片不分页：

```css
@media print {
  body { max-width: none; padding: 0; }
  .card { break-inside: avoid; }
}
```

### 安全性

- 该方式为静态文件服务，无后端逻辑，仅适用于文档展示
- 如文档包含敏感信息，注意端口映射可能被他人访问

---

## 四、完整示例：一键脚本

将以下内容保存为 `deploy.sh`，一键完成转换 + 启动：

```bash
#!/bin/bash
INPUT="${1:-input.md}"
PORT="${2:-8080}"

echo "📄 转换: $INPUT → output.html"
npx marked -o /tmp/_body.html -i "$INPUT"

echo "🔧 包装完整 HTML..."
node -e "
const fs = require('fs');
const b = fs.readFileSync('/tmp/_body.html','utf-8');
fs.writeFileSync('output.html',
  '<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n' +
  '<meta charset=\"UTF-8\">\n' +
  '<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n' +
  '<title>$(basename "$INPUT" .md)</title>\n' +
  '<style>' + fs.readFileSync('/dev/stdin','utf-8') + '</style>\n' +
  '</head>\n<body>\n' + b + '\n</body>\n</html>'
);
" < /path/to/style.css  # 或直接内联样式

echo "🌐 启动服务: http://0.0.0.0:$PORT"
python3 -m http.server "$PORT" --bind 0.0.0.0
```

---

## 五、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 浏览器显示纯文本 | 文件被当作 text/plain 提供 | 文件后缀必须为 `.html` |
| 样式丢失 | CSS 未正确内联 | 将所有 CSS 放入 `<style>` 标签，或使用内联样式 |
| 手机上显示很小 | 缺少 viewport meta | 添加 `<meta name="viewport" content="width=device-width, initial-scale=1.0">` |
| 连接被拒绝 | 端口未绑定 0.0.0.0 | 加 `--bind 0.0.0.0` 参数 |
| 中文显示乱码 | 编码问题 | 文件保存为 UTF-8，添加 `<meta charset="UTF-8">` |
| details/summary 不工作 | 浏览器兼容性 | 现代浏览器均支持，无需额外 polyfill |

---

## 六、适用场景

- 复习资料分享（手机/平板/电脑均可看）
- 团队文档展示（无需登录，打开链接即可）
- 快速原型/演示（从 .md 到网页 1 分钟）
- 临时文件共享（服务关闭即消失，不留痕迹）

---

*整理日期：2026-06-18*
