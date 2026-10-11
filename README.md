# Relight Desk · 光影工作台

本地、纯浏览器的单图重打光原型。AI 仅在生成深度时运行一次；灯光、法线、高光、赛璐璐和深度投影在 WebGL2 中实时计算。不生成或重画原图，不提供图片上传接口。

## 启动

需要 Node.js 22.12+ 或 24、支持 WebGL2 和浮点渲染目标的现代浏览器，建议使用开启硬件加速的 Chrome / Edge。

在 PowerShell 7 中执行：

```powershell
Set-Location -LiteralPath 'E:\deepseek_workspace\relight-desk'
pwsh -NoProfile -File .\start.ps1
```

打开终端打印的 `http://127.0.0.1:5178/`。脚本首次运行会执行 `npm ci`，之后无需重复安装。

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview -- --port 5179 --strictPort
```

`dist/` 是生产构建。通过本地 HTTP 服务打开；不要用 `file://`。没有 Python、云端推理、账号或数据库。

## 使用

1. 内置场景无需下载模型，即可测试底光、投影、双灯、赛璐璐、各通道及导出。
2. 点击「打开图片」或把 PNG / JPEG / WebP 拖到画布；点击「生成深度与法线」。
3. 首次从 Hugging Face 下载 `onnx-community/depth-anything-v2-small` FP32 权重（约 99 MB）并缓存。WASM 运行时随应用构建提供。图片像素只在本地 Worker 中处理。
4. 推理后拖动画布或灯光圆点移动所选灯，滚轮改变灯离画面的距离。空格＋拖动平移，画布右下角控制缩放。
5. 默认全图参与受光和接收投影。透明区域不遮挡、不接收阴影。「影响蒙版」只控制光照结果与原图的混合，不改变几何的投影资格。
6. 原画模式保留原有纹理，但旧阴影仍然存在。只有真正的无光照底色，才适合「无光照底色」模式。

灯光最多 8 盏。预设会替换灯光列表，但不修改深度通道。双灯预设会启动环绕动画，可取消「自动环绕」停止。

### 模型问题

- WebGPU 不存在或执行失败时，选择 WASM 重试；WASM 在本机 CPU 上运行，速度较慢。
- 首次模型下载需要联网。下载失败会显示错误，不会使用亮度图假冒深度。
- 更换图片或点击取消会终止当前推理 Worker；浏览器模型文件缓存仍保留。不会自动保存你的图片。
- 推理失败不影响已有通道或内置场景。图像过大时请先缩小，导入上限为 2400 万像素，另外受 GPU 最大纹理尺寸限制。

## Blender / 其他 3D 软件通道

所有文件必须是同一相机、同一帧、相同宽高。尺寸不一致会拒绝导入，绝不静默拉伸。

| 通道 | 格式和约定 |
|---|---|
| 主图 / 底色 | PNG、JPEG、WebP；作为 sRGB 图像读取。优先使用 PNG 保留 Alpha。 |
| 法线 PNG | 相机空间，X 向右、Y 向上、Z 朝观察者；存储为 `N * 0.5 + 0.5`，RGB 读回后解码到 -1…1。 |
| 法线 EXR | 独立 RGB / RGBA EXR，保留原始有符号相机空间 XYZ，不做 0…1 编码。 |
| 深度 PNG | 灰度，默认近白远黑；8 位 PNG 的精度有限，精确数据建议用 EXR。 |
| 深度 EXR | 独立 RGB EXR，把距离或高度复制到 RGB；读取 R 通道。普通相机距离一般需要勾选「反转深度」。 |
| 影响蒙版 | 灰度 PNG / 独立 RGB EXR，0 保持原图、1 使用重打光结果。 |

注意：

- **不要把 Blender 世界空间 Normal Pass 直接当成相机空间法线。** 先用相机旋转的逆矩阵转换方向，或在材质/AOV 中输出相机空间方向；不平移法线。Blender 相机朝本地 -Z 看，面向相机的表面法线一般应为 +Z。
- 法线和深度都是数据，不能套用 AgX、Filmic、显示变换或 sRGB 编码。法线 PNG 的 0…1 编码是线性数值映射，不是 gamma 编码。
- 用 Color 类型输出有符号法线 EXR 时先验证是否保留负值；不要在输出前 Clamp。
- 首版不解析多层 EXR、Cryptomatte 或 Position Pass，不重建真实相机；把这些通道提前拆成上述独立文件。
- 深度统一作为正交视角的相对高度场。透视相机的欧氏距离不是严格的高度，可能需要自行转换/调节，不能承诺物理一致。
- 内置精确法线与外部法线会覆盖深度派生法线；需要切回计算法线时点击「改用深度法线」。

## 导出

- **PNG**：原图分辨率，不包含灯位标记或网页 UI，使用高质量投影（全分辨率、96 步、最多 4 个面积光样本）。
- **法线 PNG**：处理后的 XYZ 映射到 RGB，保留原图 Alpha；数据图不经过 sRGB 编码。
- **PFM**：`Pf` 单通道 float32、小端、底向上行序。保存归一化/反转后的原始浮点深度（0…1，近白），尚未应用保边平滑和高度强度。精度不会经过 8 位图片。首版导出 PFM 但不支持直接重新导入 PFM，需在外部转成 RGB EXR。
- **设置 JSON**：版本 1，保存灯光和参数，不包含图片。恢复设置需先加载对应原图/通道；导入时校验范围及版本。

## 实现结构

- `src/depth.worker.ts`：模型缓存、WebGPU / WASM 推理、浮点深度返回。
- `src/renderer.ts` 与 `src/shaders.ts`：float32 高度缓存、保边平滑、法线、按灯分组的高度场光线步进、面积采样、深度引导滤波及线性空间合成。
- `src/main.ts`：交互、任务取消、文件导入、参数和预设。只在需要时重画；拖灯不会重新计算模型或无关法线通道。
- `src/demo.ts`：程序化椭球表面交点生成的测试肖像、前景手臂及接收背景，不含第三方插画。
- `src/qa.ts`：开发环境浏览器 GPU 回读测试和基准，未被生产入口引用，不进入生产构建。

### 回归检查

`npm test` 覆盖浮点深度、非方形梯度、平面与遮挡、EXR 符号和行序、PFM 编码、设置验证。真实 WebGL 检查需启动开发服务器，在本地页面开发者控制台执行：

```js
await (await import('/src/qa.ts')).runGPUChecks()
await (await import('/src/qa.ts')).benchmark(1)
await (await import('/src/qa.ts')).benchmark(8, 60)
```

GPU 测试会创建独立临时渲染器，结束后释放，不改当前图片或灯光。基准是当前浏览器的帧调度与渲染耗时，不是所有设备的性能保证。

## 效果边界

这是固定视角 2.5D 重打光，不是完整三维渲染。原图外、被挡住的表面和多层透明几何不在单层深度里。原视频画面只用于本地内部测试，没有包含在默认场景或 `dist/` 中。

Depth Anything Small 对插画脸部、发丝、交叠肢体可能估计错误。外部准确通道可以改进效果，但不能补足看不见的几何。内置测试场景的成功不代表已经逐像素复刻原视频。

## 依赖与来源

- [Three.js](https://github.com/mrdoob/three)：MIT；自定义着色器由本项目实现。
- [Transformers.js](https://github.com/huggingface/transformers.js)：Apache-2.0。
- [Depth Anything V2 Small ONNX](https://huggingface.co/onnx-community/depth-anything-v2-small)：模型页面标注 Apache-2.0。
- [原视频视觉参考](https://x.com/de_nier_ai/status/2107288975472025709)：仅参考交互和视觉目标，未取得原作者源码，也未使用其品牌素材或插画作为分发资源。

已完成和未完成的实际验证见 `verification/REPORT.md`。
