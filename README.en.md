# Relight Desk

[简体中文](README.md)

Local image relighting with real-time lights, depth-based self-shadows and background shadows. An independent implementation inspired by AiDeNier's video, not the original author's release. It does not regenerate your image.

![Default illustration with bundled depth and normals](verification/default-example.png)

## Quick start

1. Install [Node.js 24 LTS](https://nodejs.org/) (24.5 or newer), then reopen your terminal.
2. Download this repository using **Code → Download ZIP** and extract it.
3. Open a terminal in the folder containing `package.json` and run:

```sh
npm start
```

The launcher installs locked dependencies, downloads and verifies about 99 MB of model files, builds the app, and starts a read-only local server at **http://127.0.0.1:5178/**. Keep the terminal open; Ctrl+C stops it. Use `npm.cmd start` if PowerShell blocks `npm.ps1`.

On Windows you can instead **double-click `start.bat`** in the project folder. It locates the project automatically and runs the same launcher, keeping error messages visible if Node.js is missing or startup fails. Keep its window open while using the app.

First-time setup needs internet. Later starts reuse verified models and installed dependencies if the lockfile is unchanged. No Python, CUDA toolkit, account, or paid API is required. Inference uses browser WebGPU or slower WASM/CPU; rendering requires WebGL2 with floating-point targets.

## Use

The default illustration ships with precomputed AI depth and normals: drag a light immediately, without inference. **Test scene** switches to the procedural fixture; **Default example** restores the illustration. Open a PNG/JPEG/WebP and generate depth to relight your own image. Edit X/Y/Z for precision; scroll for light height, Space+drag to pan. Export PNG, normal PNG, floating-point PFM and settings JSON. Chinese/English switching is available in the top bar.

### Bundled example

`public/example/` includes the byte-identical 2071×3021 original, an uncropped 1053×1536 display copy, RGB camera-space `normal.png`, and normalized little-endian top-down Float32 `depth.f32`. The 8-bit depth PNG is a preview only. Depth was baked locally with Depth Anything V2 Small FP32; normals were derived from its edge-smoothed height field. Changing surface settings regenerates normals from float depth without rerunning AI. These are estimates, not ground-truth geometry.

Opening the example does not request model weights. Use `npm start -- --demo-only` to skip downloading weights as well. Other images still require the model or imported passes. The manifest records hashes and bake settings. Maintainers can regenerate with `node scripts/bake-example.mjs "source.png"` after preparing the local model.

`public/example/settings.json` stores the maintainer-tuned pink-purple fill, warm key light and complete render settings. Opening/restoring the default example or resetting its lights restores this configuration; other images and the procedural test scene keep their generic defaults.

The illustration was supplied by the project maintainer; no new artwork license is granted by its inclusion. Check the original rights holder's permission before redistribution or commercial use. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Model management

Weights are ordinary files under `models/onnx-community/depth-anything-v2-small/`, **not browser Cache Storage**. Your browser reads them from the local server and runs inference on your computer. No image upload endpoint exists.

```sh
npm start -- --model-dir "D:\Models\RelightDesk"
npm start -- --port 5180
npm start -- --no-open
npm run models:download
npm start -- --demo-only
```

`RELIGHT_MODEL_DIR` is also supported; the CLI option wins. Files are pinned to a revision and SHA-256 hashes in `model-manifest.json`. Valid files are reused without a download request; incomplete files restart from scratch. Invalid files are preserved as `.invalid-*` backups before replacement. Standard HTTP_PROXY/HTTPS_PROXY variables are supported. Weights and images opened in the app are not committed to Git; the bundled example is explicitly distributed with the repository.

Depth Anything V2 Small FP32 estimates relative depth. Normals are derived using GPU shaders, without a second model. Clearing browser data does not remove disk files. Older browser caches are neither migrated nor deleted.

## Blender and limitations

**Open image** and drag/drop accept standalone RGB/RGBA EXR (half/float). Images are interpreted as linear sRGB/Rec.709 with straight alpha. Float HDR data is preserved for lighting; AI uses an 8-bit sRGB preview. Display/PNG output is SDR and clips out-of-range values; lowering exposure in the lit view recovers HDR highlights. No Blender AgX/Filmic or ACES conversion is applied. Export multilayer/Deep EXR passes separately. Depth/normal EXRs still use their dedicated data-channel import without color conversion. EXR export is not included.

Import matching-resolution camera-space normals and relative depth as PNG or standalone RGB EXR. X right, Y up, Z toward the viewer. Do not apply color transforms to data. Multilayer EXR is unsupported. See the [advanced guide](docs/ADVANCED.md).

This is fixed-view 2.5D relighting, not full 3D reconstruction. Existing baked lighting is not removed. Hidden geometry, hair and illustrations may have inaccurate estimated depth. The procedural demo is not proof of parity with the reference artwork.

The launcher binds to localhost only; it does not publish a website. Public hosting requires HTTPS and explicit model routes as well as the frontend. Copying `dist/` alone is not a complete model-enabled deployment.

## Development

```sh
npm ci
npm run models:download
npm run dev -- --port 5178
npm test
npm run build
```

See [deployment verification](verification/DEPLOYMENT.md) for tested and untested behavior. Windows/Linux CI is configured; its result depends on the repository's actual Actions run.

See [third-party notices](THIRD_PARTY_NOTICES.md). A license for this project's own source has not yet been selected by its owner.
