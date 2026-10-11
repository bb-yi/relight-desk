# Default illustration verification

Verified on Windows, 2026-10-11. Source supplied by the project maintainer: `142171035_p0.png`.

- The stored original SHA-256 matches the supplied file byte-for-byte: `b6d19a0e22c372c7b6b681f2a1fd3e008c6a2091474da0093ed81d46faff4e22`.
- Local Depth Anything V2 Small ONNX FP32 inference completed with ONNX Runtime CPU; no remote inference service. Exact model revision and asset hashes are in `public/example/manifest.json`.
- Original: 2071×3021. Display image and all active passes: 1053×1536, uncropped.
- `npm test`: **32/32 passed**. Checks include asset hashes/dimensions, finite non-8-bit float depth, unit normals over every pixel (including bottom rows), invalid-depth rejection and baked-normal invalidation when surface settings change.
- `npm run build`: TypeScript and production build passed; existing bundle-size warning remains.
- Actual production page at `http://127.0.0.1:5180/` loaded the supplied illustration with a bundled-pass status. Resource timing showed only the application JS/CSS and `color.png`, `depth.f32`, `normal.png`: no model, inference Worker or WASM request.
- Inspected color, depth and normal views. Moving light X from −0.6 to 1.2 moved the marker outside the image and changed direct lighting and cast-shadow direction.
- Switched to the procedural test scene and back; changed Chinese/English and verified translated bundled-pass status.
- Browser-exported normal PNG reopened at 1053×1536; maximum channel difference versus the baked normal was 1/255 after normalization/quantization. PFM export reopened and matched every Float32 depth value exactly after accounting for bottom-up rows.
- Browser warning/error log was empty at completion. Screenshot: `default-example.png`.

The bake script clones the image before model preprocessing, which converts its input from RGBA to RGB in place. This avoids corrupting later edge-aware filtering. The normal integrity test covers the whole image to catch truncated/black lower rows.

These are estimated illustration passes, not Blender ground truth. No new performance benchmark or claim of parity with the reference video is made. Artwork authorship/redistribution permission has not been independently verified; see `THIRD_PARTY_NOTICES.md`.
