# EXR main-image verification — 2026-10-12

- Added standalone EXR to the main file picker and shared drag/drop image reader.
- Scene-linear float RGBA is retained separately from the sRGB byte preview used for AI and edge guidance. Lighting consumes the float texture directly, without a second sRGB decode. All image textures participate in the existing disposal lifecycle.
- **39/39 tests passed**, including real half/float EXR decoding, ZIP compression, empty browser MIME with uppercase extension, row orientation, alpha, HDR values, invalid-file errors, and unchanged linear depth-channel decoding. Production build passed.
- Actual browser test on the running production server (`127.0.0.1:5178`) used a separate tab; the user's page and service were not refreshed or stopped.
- Imported a generated 256×256 ZIP float EXR: red/grey top row, blue/half-transparent green bottom row displayed correctly. Imported matching EXR depth and exported relit PNG successfully. Browser warning/error log was empty.
- With white ambient=1, direct lights disabled, base-color mode, and exposure −3, a source linear red value of 4 produced PNG RGBA `[188,0,0,255]`, exactly as expected for linear 0.5 encoded to sRGB. This verifies HDR survived decoding, GPU upload and lighting rather than being clipped to the byte preview.
- Screenshot: `exr-hdr-import.png`.

Assumptions/limits: linear sRGB/Rec.709 primaries, straight alpha; no automatic ACES/AgX/Filmic conversion, no multilayer/Deep EXR extraction, and no EXR export. SDR display and PNG output clip outside 0–1 after encoding. The user's own Blender EXR has not yet been supplied/tested.
