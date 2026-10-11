# 一键启动与磁盘模型验证

2026-10-11，Windows / Node.js 24.19.0 / Chromium / RTX 4080。

## 已验证

- 首次 `npm run models:download` 下载固定版本的 config.json、preprocessor_config.json 和 99,060,839 字节 FP32 ONNX，全部通过大小与 SHA-256 校验。
- `npm start -- --port 5180 --no-open` 实际完成依赖安装、复用已下载模型、生产构建及启动。
- 第二次 `npm start -- --port 5181 --no-open --model-dir ".cache/custom model store"` 实际复用依赖和三个已校验文件；带空格的自定义目录启动正常，没有模型下载日志。自定义目录的模型 HTTP 路由另有单元测试覆盖。
- 新生产服务器（5180）中，浏览器 **WebGPU 与 WASM 两条路径都实际完成了深度推理**，不是仅检查构建或端口。
- `npm test` 26/26 通过。新增 6 项覆盖固定版本/哈希、无网络函数调用的二次复用、下载损坏拒绝、临时文件清理、错误旧文件备份、自定义模型目录、只读服务、路径越界拒绝。
- `npm run build` 和 TypeScript 检查通过。仍有大包体积提示，属于推理运行时/Three.js 体积，不是构建失败。
- Windows 启动脚本调用 npm CLI 不再通过 shell 拼接参数；修改后第二次实际启动通过。
- 浏览器模型配置关闭远程加载及模型 Cache Storage，模型 URL 指向同源 `/models/`。旧版缓存未删除。

## 边界

- 未进行物理断网整机验收。受控代理故障测试被工具策略拒绝，没有绕过；“完整文件复用不调用 fetch”由针对性单元测试直接断言，真实第二次启动也走复用分支。
- 本次使用 `--no-open`，未实际唤起系统默认浏览器；已在应用内浏览器打开并实测生产页面。
- Windows/Linux GitHub Actions 已配置，尚未取得云端运行结果；本机为 Windows，未声称已完成 Linux/macOS 整机验收。
- 没有重跑完整 GPU 性能矩阵或用户 Blender 素材；渲染器算法未修改。
- 默认只监听本机，没有公网部署、账号系统、图片上传接口或云端推理。

## 发布准备

README.md 面向中文新手；README.en.md 提供英文快速开始；docs/ADVANCED.md 保留 Blender 和通道细节。THIRD_PARTY_NOTICES.md 标注模型、依赖及视觉参考来源。

模型、node_modules、dist、.cache 和 .env 已排除，不作为 GitHub 源码内容提交。仓库可见性和项目源码许可证仍需所有者决定；准备完成不等于 GitHub 已发布。
