# Nguồn của Demo 1

- Model, layout, đạo cụ, âm thanh tổng hợp: tạo bằng code cho bản demo, không lấy từ ảnh hoặc bản đồ địa điểm thật.
- Không chứa Google Maps/Street View, dữ liệu OSM/Overture/Open Buildings hoặc ảnh người dùng. Credit các bộ dữ liệu sẽ được bổ sung khi thực sự sử dụng.
- Three.js và OrbitControls: MIT, https://github.com/mrdoob/three.js.
- React, Zustand, TanStack và các thư viện UI: theo giấy phép của từng dependency. Không thay đổi giấy phép nguồn.
- Font UI của app Lovable vẫn là Be Vietnam Pro và Lora từ Google Fonts; bản HTML portable dùng font hệ thống khi không có sẵn. Google Fonts không phải Google Maps và không được dùng làm nguồn model.

## P9 — Tác nhân và âm thanh

Mọi hình tác nhân (xe máy/ô tô/bus/ba gác/xe đạp/người/hàng rong/chó/mèo/gà), đèn xe và fixture P9 đều procedural/tổng hợp được tạo trong mã dự án; không asset bên ngoài, ảnh người, biển số, nội dung Google hoặc bản thu phố thật. WebAudio noise/tone/loop tự tổng hợp, không file loop/asset audio mới để phân phối. Không dependency mới; dùng lại Three.js MIT và `BufferGeometryUtils.mergeGeometries` trong gói đã khóa. Clip local do người xem chọn chỉ ở phiên, không phải asset phát hành; file audio-local bị gitignore. Không sao chép âm thanh bên thứ ba hoặc yêu cầu micro.

## P10 — kỷ niệm tổng hợp

Ba ghim mẫu, nhật ký demo, ảnh metadata/12 MP và UI bằng chứng được tạo bằng mã từ hình/màu giả lập, không dựa khu thật/ảnh cá nhân. Sentinel đều tổng hợp. Pin dùng hình học Three.js hiện hữu; không ảnh Google, nhạc/model/asset tải về hay dependency mới; giữ giấy phép thư viện sẵn có.

P10 giữ đúng ba liên kết Google Fonts của main cho Be Vietnam Pro và Lora; các harness P10 chỉ abort request tới `fonts.googleapis.com`/`fonts.gstatic.com`, không cho phép host ngoài. Không đóng gói/copy tệp font; Google Fonts không phải Google Maps và không phải nguồn model.

## M2 — Công cụ coverage (dev-only)

Không thêm dependency runtime. Các package mới để đo coverage, giữ guard 24 giờ và kiểm lifecycle/native:

| Package                 | Version  | License      |
| ----------------------- | -------- | ------------ |
| `@bcoe/v8-coverage`     | `1.0.2`  | MIT          |
| `@vitest/coverage-v8`   | `4.1.11` | MIT          |
| `ast-v8-to-istanbul`    | `1.0.7`  | MIT          |
| `html-escaper`          | `2.0.2`  | MIT          |
| `istanbul-lib-coverage` | `3.2.2`  | BSD-3-Clause |
| `istanbul-lib-report`   | `3.0.1`  | BSD-3-Clause |
| `istanbul-reports`      | `3.2.0`  | BSD-3-Clause |
| `js-tokens`             | `10.0.0` | MIT          |
| `magicast`              | `0.5.5`  | MIT          |
| `make-dir`              | `4.0.0`  | MIT          |

Nguồn và thời gian phát hành đã kiểm từ npm registry, ghi trong `docs/assets/qa/codex/m2/dependency-review.json`. Gitleaks CLI 8.30.1 dùng giấy phép MIT từ dự án gitleaks/gitleaks, không vào dependency hoặc bundle app.

M2 giữ công thức scalar clamp/lerp tương đương `three/src/math/MathUtils.js` (MIT) trong camera pose thuần để vỏ không import Three.js. Hàm dựng Vector3 vẫn ở engine lazy. Không thêm asset/runtime dependency cho thay đổi này.
