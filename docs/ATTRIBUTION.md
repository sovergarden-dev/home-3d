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

## M3 — Font cục bộ

Be Vietnam Pro (Copyright 2021 The Be Vietnam Pro Project Authors) và Lora (Copyright 2011 The Lora Project Authors, Reserved Font Name Lora), SIL Open Font License1.1. Giữ nguyên file WOFF2 từ nguồn phân phối Google Fonts, chỉ chọn subset Vietnamese/Latin và face đã dùng; không sửa tên hoặc glyph. OFL nguyên văn và bảng SHA256/URL nguồn nằm ở `src/assets/fonts/`. Google Fonts không phải Maps và không dùng làm nguồn hình học.

Ứng dụng bỏ stylesheet/preconnect Google Fonts và dùng URL asset do Vite phát sinh. Việc xác minh network0hostngoài và font tiếngViệt còn phải chạy trước khi ghi DONE.

### Kiểm a11y M3

axe-core 4.14.0 (MPL-2.0), công cụ dev để kiểm WCAG trong browser; không vào bundle runtime. Metadata công khai phát hành 05/10/2026, không có dependency/install script. Tarball và kết quả test còn NOT_VERIFIED ở bước chuẩn bị.
