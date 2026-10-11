# Third-party components and reference

- Three.js 0.180.0: MIT. https://github.com/mrdoob/three/blob/dev/LICENSE
- Transformers.js 3.8.1: Apache-2.0. https://github.com/huggingface/transformers.js
- ONNX Runtime (installed through Transformers.js): MIT. https://github.com/microsoft/onnxruntime/blob/main/LICENSE
- Depth Anything V2 Small ONNX: Apache-2.0 as identified in the model card. https://huggingface.co/onnx-community/depth-anything-v2-small
- Original Depth Anything V2: https://github.com/DepthAnything/Depth-Anything-V2

Model weights are not committed to this repository. The launcher downloads the exact upstream revision and verifies the files listed in `model-manifest.json`. The model retains its upstream license; downloading it does not change that license. See each dependency's installed LICENSE/NOTICE files for full terms.

Interface and visual behavior were inspired by AiDeNier's Relight Desk video: https://x.com/de_nier_ai/status/2107288975472025709 . This is an independent implementation, not the original author's code or an official release. The distributed default scene and screenshots use a procedural test portrait, not the reference video's illustration.

No project-wide source license has been selected yet. Third-party license terms above do not grant a separate license for this project's own source.
