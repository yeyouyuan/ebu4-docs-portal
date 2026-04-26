# e-Cology Token Extractor 🗝️

专为 `www.e-cology.com.cn` 设计的浏览器 Token 提取扩展，支持 Chrome / Firefox / Edge / Opera / Brave 等主流浏览器。

## 功能特性

- ✅ **自动检测** — 打开 e-cology 页面即自动扫描有效 Token
- ✅ **一键复制** — 单个复制 / 全部复制，支持 `name=value` 格式
- ✅ **悬浮面板** — 页面右下角精美观测面板，可拖拽/最小化/关闭
- ✅ **Popup 界面** — 点击扩展图标快速查看和操作
- ✅ **设置页面** — 丰富的配置选项
- ✅ **实时监听** — Cookie 变更自动刷新
- ✅ **跨浏览器** — 基于 Manifest V3，兼容所有现代浏览器
- ✅ **后台桥接** — 可直接与 EBU4 后台“日报抓取”页联动，一键导入浏览器中的有效 Cookie

## 安装方法

### Chrome / Edge / Brave / Opera

1. 打开浏览器，进入扩展管理页面：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`
   - Opera: `opera://extensions/`

2. 打开右上角 **「开发者模式」**

3. 点击 **「加载已解压的扩展程序」**（Edge 为「加载解压缩的扩展」）

4. 选择本项目文件夹 `ecom-token-extractor`

5. 安装完成！🎉

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`

2. 点击 **「加载临时附加组件…」**

3. 选择本项目中的 `manifest.json` 文件

4. 安装完成！（注意：Firefox 临时扩展在重启后需重新加载）

> 💡 **持久化安装**：如需永久安装，可使用 `web-ext` 工具打包为 `.xpi` 文件。

## 使用说明

### 方法一：Popup 界面
1. 在 e-cology 页面点击浏览器工具栏中的扩展图标
2. Token 自动列出（自动模式），点击「复制」即可

### 方法二：页面悬浮窗
1. 打开任何 `e-cology.com.cn` 页面
2. 右下角自动显示 Token 面板
3. 可拖动面板位置，点击 ⚡ 切换自动/手动模式
4. 点击 `✕` 可直接关闭悬浮窗；如需恢复，可在插件 Popup 的“页面悬浮窗”开关里重新打开

### 方法三：设置页面
- 点击 Popup 中的 ⚙️ 按钮进入设置
- 可配置自动扫描、悬浮窗显示、Cookie 监听等

### 方法四：与 EBU4 后台联动
1. 打开 EBU4 后台的“日报抓取”页
2. 页面会自动检测插件状态
3. 若状态显示“已连接”，点击“从插件导入 Cookie”
4. Cookie 会自动写入后台表单，然后可直接开始抓取

> 当前发布包默认只为本地开发后台地址注入 bridge：
>
> - `http://localhost:3000/admin*`
> - `http://127.0.0.1:3000/admin*`
>
> 如果你的后台部署在其它域名，需要在 `manifest.json` 的第二个 `content_scripts.matches` 中追加对应后台地址后重新加载扩展。

## 文件结构

```
ecom-token-extractor/
├── manifest.json      # 扩展清单（Manifest V3）
├── background.js      # Service Worker（Cookie 探测）
├── content.js         # 内容脚本（页面悬浮窗）
├── content.css        # 悬浮窗样式
├── popup.html         # Popup 界面
├── popup.css          # Popup 样式
├── popup.js           # Popup 逻辑
├── options.html       # 设置页面
├── options.css        # 设置样式
├── options.js         # 设置逻辑
└── icons/
    ├── icon.svg       # 矢量图标
    ├── icon16.png     # 16×16
    ├── icon48.png     # 48×48
    └── icon128.png    # 128×128
```

## 隐私声明

- 🔒 本扩展**仅**在 `e-cology.com.cn` 域名下运行
- 🔒 Token 数据**仅存储在本地浏览器**，不上传任何服务器
- 🔒 无任何远程请求或数据外发行为

## 版本

**v1.1.1** — 2026-04-17
