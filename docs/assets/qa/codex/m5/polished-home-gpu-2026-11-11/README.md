# M5 T21: Fixed-Home Physical GPU Benchmark

- T21 đo sa bàn tổng hợp `HOME_NEIGHBORHOOD` sau khi giảm shader khởi động, gỡ phụ thuộc khỏi root shell và dọn E2E retired. Kết quả chỉ áp dụng trên máy Windows, Chrome/driver, DPR 1 đã nêu; không chứng nhận mobile, native Safari hay dữ liệu khu thật (`REAL_WORLD_NOT_VERIFIED`).

## Nguồn gốc

- Commit mã và SHA harness: `cfbb1f4b610b7a3a9ad4240ca0bc68c402f078d1` (trường `environment.sourceSha` và `environment.harnessSha`); `harnessTreeClean: true`.
- Phép đo thứ hai và cuối cùng được phép. Lượt đầu có `adapterUpperBoundBytes = 802.377.728 B`, `nvidia-smi` delta `764 MiB`; tiến trình GPU khác dùng chung adapter nên giữ kết quả `NOT_VERIFIED`, không quy cho ứng dụng. Lượt được chấp nhận đạt `172.969.984 B`, đối chiếu khớp `nvidia-smi +171 MiB` (`adapterMatchesNvidia: true`).
- SHA-256 script: `e5059fe2d873c040a7846cc43bbdc3ddbd2b7ee83c1076137ac6ae267e3a27e9`.
- SHA-256 fixture: `41c14131c84f68b6d7a678857405a2e7f94a5f370dd42cb81bf4869b65a2e305` (`syntheticOnly: true`).
- Môi trường: Chrome `157.0.8103.50`, headed, NVIDIA GeForce GTX 1660 Ti, driver `32.0.16.1074`, renderer ANGLE/D3D11, viewport `1440×900`, DPR 1.
- Phương pháp: bốn kịch bản fixed-home, mỗi kịch bản 600 bước camera. FPS tính từ thông báo render engine gom theo RAF timestamp; frame interval là nhịp hoàn tất CPU submission, không phải scanout màn hình hay thời gian thực thi GPU. Không lọc các khoảng chậm.

## Kết quả

| Kịch bản               |      FPS p05 / p50 / p95 | Frame ms p50 / p95 / max | Draw calls | Tam giác | Instance minh hoạ | Kết quả |
| ---------------------- | -----------------------: | -----------------------: | ---------: | -------: | ----------------: | ------- |
| `sunny-paused-plain`   | 141.64 / 143.99 / 144.02 |      6.90 / 7.60 / 13.70 |        112 |    8,484 |                 0 | `MET`   |
| `sunny-paused-details` | 143.95 / 143.99 / 144.02 |       6.90 / 7.60 / 9.90 |        115 |   16,432 |               296 | `MET`   |
| `storm-active-plain`   | 143.95 / 143.99 / 144.02 |      6.90 / 7.50 / 14.80 |        113 |    7,468 |                 0 | `MET`   |
| `storm-active-details` | 143.99 / 143.99 / 144.02 |      6.90 / 7.50 / 10.50 |        116 |   15,416 |               296 | `MET`   |

Cả bốn kịch bản đạt ngưỡng `mid`: FPS p50 ≥ 55, frame max ≤ 50 ms, draw calls ≤ 200, triangles ≤ 800.000. Cận trên bộ nhớ GPU cấp adapter `172.969.984 B` ≤ `350.000.000 B`, do đó `midBudgetStatus: MET`. Đỉnh phân bổ per-process của tiến trình con trình duyệt là `187.453.440 B` và đáng tin khi đối chiếu counter adapter. Delta adapter gồm mọi tiến trình GPU; đây không phải số bộ nhớ texture riêng của ứng dụng.

## Tệp và hash

Tất cả tệp dưới 1 MB, chỉ chứa fixture tổng hợp, đã qua quét đường dẫn cá nhân; JSON dùng LF.

| Tệp                                                    |    Byte | SHA-256                                                            |
| ------------------------------------------------------ | ------: | ------------------------------------------------------------------ |
| `desktop-chrome/report.json`                           | 363.938 | `9c49cba7623cdbdb2b1994cb9f8882ac0884f84ce42e72d1f7d86f4083a9e95c` |
| `desktop-chrome/gpu-memory.json`                       |  96.902 | `1735f07c914452fba7d82b0b45c14c51877c55c73d3339ff92c5d5c765ab3ab7` |
| `desktop-chrome/gpu-memory.json.baseline.json`         |   1.711 | `0b3de7db9a13a5852b2b532dd7dff15d6d1c2c49d820becc5a35ded60cc07b03` |
| `attempt-1-not-verified/report.json`                   | 363.349 | `26e7515961a8e786efac2a591b20fe3c3c3cc79f1e3fcad4d9fe60cec98b769b` |
| `attempt-1-not-verified/gpu-memory.json`               |  93.987 | `79412c6261fbb38f096fbb19337c7d580719fa21fc8e5b6e511d94d14593d4f7` |
| `attempt-1-not-verified/gpu-memory.json.baseline.json` |   1.711 | `25770f5c01497cc943c046b1964fd0696a2789e109c1264f452af99e511a0648` |

`desktop-chrome/report.json` là lượt thứ hai được chấp nhận. `attempt-1-not-verified/` giữ lại chẩn đoán nhiễu bộ nhớ adapter của lượt đầu. Không giữ ảnh chụp từng lượt trong QA artifact công khai; các báo cáo có đủ bảng đo và mẫu browser thô.
