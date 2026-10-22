# Bằng chứng P10 — chỉ dữ liệu tổng hợp

Bộ này thuộc nhánh `feat/p10-memories`, từ `main` tại `72dd2bed1d58c558018538a51aae02f74304bc7d`. Đây là hồ sơ nộp review, không phải nghiệm thu khu thật hay bản phát hành. Receipt cuối duy nhất được ghi ở đầu [trang P10](https://app.notion.com/p/7592ff65db1f411db4d7cc8e36c2b691); Notion AI quyết định review kỹ thuật.

## Xem nhanh

Các ảnh được chụp từ app, không ghép giao diện và không dùng ảnh khu thật. Fixture là `synthetic-neighborhood-v1`, ba kỷ niệm/nhật ký mẫu và ảnh sọc sinh ngay trong harness. Giờ cảnh 07:00, ngày 2026-06-21, heading 28, zoom 1, DPR 1. Editor được điền cùng ngày cố định; tour dùng camera mẫu riêng. Chi tiết ở [visuals.json](visuals/visuals.json). Mỗi PNG dưới 1 MB.

- [Diorama có ba ghim](visuals/diorama-pins.png), [Mặt bằng có ghim](visuals/topdown-pins.png).
- Editor [390×844](visuals/editor-390x844.png) và [740×390](visuals/editor-740x390.png): cửa sổ có scroll, focus, Escape; không ép toàn bộ form vào màn hình ngang thấp.
- [Thẻ tour](visuals/tour-card.png), [ảnh trước/sau với slider](visuals/journal-before-after.png).
- [Bưu thiếp 2K](visuals/postcard-2k.png), [Xem như khách](visuals/guest.png).

Đã tự xem đủ bộ; đã đưa mẫu ra mặt đường tổng hợp để tránh nằm trong footprint, sửa góc tour quá gần và giữ khung so sánh/slider vừa vùng scroll dock. Không đổi hình học world.

## Phép đo tái lập

Xem [runbook](../../../P10_RUNBOOK.md) và các harness `scripts/p10-*`. Before và after dùng cùng fixture/camera/giờ/viewport/DPR, warm-up 5 giây, ba lượt; baseline main được xác minh bằng PID, cwd và SHA. Không chạy browser GPU cạnh tranh trong chuỗi đo. Frame intervals giữ mọi outlier; idle/stationary, tour, ảnh 12 MP và capture tách riêng. Latency chính đo save/delete thật khi dock mở, không lấy Undo làm thêm mới.

Ngưỡng cố định trước phép đo: thêm/xoá phản ánh trên frame dưới 100 ms sau warm-up; soak ít nhất 1.200.000 ms và ít nhất 20 chu kỳ. Không đổi timeout 90 giây, assertion hay capability guard H6/P9, không đổi workflow để làm xanh. SwiftShader là GPU phần mềm; CPU pixel-buffer estimate, JS heap và texture count không phải số đo GPU memory.

## Kết quả cuối: H còn BLOCKED, không tự nhận đạt hiệu năng

[Summary máy đọc được](summary.json), [toàn bộ raw gốc](raw-samples.tgz), [SHA-256 archive](raw-samples.sha256). Archive có source checksum, base/head phép đo và cả lượt soak bị gián đoạn; không xoá outlier hoặc gộp lượt lỗi vào lượt đạt.

| Pha                     |   n | p50 ms | p95 ms | max ms |
| ----------------------- | --: | -----: | -----: | -----: |
| Main, stationary        | 250 |  116.6 |  233.3 |  266.7 |
| P10, 3 ghim, stationary | 269 |    100 |  216.6 |  249.9 |
| P10, tour/300 ghim      | 142 | 166.65 |    400 |  516.7 |
| Thêm thật, 299→300      |  15 |  629.2 |  824.2 |  824.2 |
| Xoá thật, 300→299       |  15 |  474.2 | 1003.4 | 1003.4 |
| Ảnh 12 MP               |  21 | 2881.5 |   3148 | 3168.4 |
| Bưu thiếp 4K            |   3 | 6457.7 | 7497.3 | 7497.3 |
| Bưu thiếp 2K            |   3 | 3156.4 | 3172.4 | 3172.4 |

**Mục tiêu thêm/xoá <100 ms: NOT_MET, 30/30 mẫu vượt mục tiêu.** Hai RAF là cận trên từ mutation đến frame, gồm React/compositor; CPU mutation riêng p50 2 ms, p95 3,8 ms, max 16 ms không thay thế latency tới frame. Không tuyên bố <100 ms chỉ từ CPU. Frame stationary của main/after matched; tour/300 là pha khác, không so trực tiếp như cùng tải. Đây là SwiftShader, không phải FPS GPU vật lý.

Cùng góc stationary: main 37 draw calls/4556 tam giác; P10 ba ghim 38/4604; P10 300 ghim 38/9356. 4K/2K mỗi cỡ ba mẫu, đều đúng 3840×2160/2048×1152, không degraded, không crash. Ước lượng bốn RGBA CPU buffer lần lượt 132.710.400/37.748.736 byte; không phải đo peak thực hay GPU memory.

**Soak hoàn tất 1.200.002 ms / 21 chu kỳ, 0 console/page error được harness ghi.** Tại các điểm sau cleanup: ObjectURL, Bitmap, IDB connection và render target đều 0; RAF đúng 1; AudioContext 0 trong kịch bản này; texture 3, geometry 42 giữ nguyên. DOM documents 3–4, nodes 1148–2685, JS listeners 284–529, không tăng đơn điệu; đây không phải chứng minh không còn bất kỳ object giữ lại nào. Heap API trả cùng giá trị coarse 81.400.000 byte: không dùng để suy ra peak, GC tuyệt đối hay GPU memory. Kịch bản bao gồm editor mở/đóng bằng UI, ảnh, tour, bưu thiếp, khách, đổi ba world tổng hợp, route và lưu.

Lượt trước dừng ở 19 chu kỳ/1060 giây khi dev server mất kết nối, **không tính đạt**. Server được khởi động lại; lượt 21 chu kỳ là lượt mới đủ thời lượng. Source app trước/sau khớp toàn bộ `source-SHA256SUMS`, tại commit `a34b61eedb98e00d02f4a8e93e9f6a8c1ed6134e`. Commit bàn giao chỉ bổ sung bằng chứng và sửa đồng bộ test tour, không đổi app đang đo.

## Cổng phần mềm và lịch sử CI

Frozen install, `bun run check` (350 unit test/56 file và pipeline tests), pipeline synthetic dry-run đều thành công. CI PR-event A [39839945783](https://github.com/sovergarden-dev/home-3d/actions/runs/39839945783) có quality/Chromium/Firefox success, WebKit 70 pass/1 fail ở test P10 chờ mù 80 ms. Test sửa sang chờ pose thực tiến triển (giới hạn 5 giây), giữ nguyên assertion/guard; WebKit local lặp 3 lần đều pass. Không thay timeout/assertion/capability H6 hay workflow. Counts cuối và full SHA của một workflow_dispatch nằm ở receipt Notion, không dùng kết quả A lỗi để tự nhận đủ cổng cuối.

H6 20 vòng tại CI A: Chromium 53,0 s; WebKit log 1,4 phút, **không đạt mốc 70 s đã nêu trong scope** (dù vẫn trong timeout 90 s và test success). Chưa có đối chứng main cùng runner để quy toàn bộ sai khác cho app; không tuyên bố đã chứng minh không regression. Kết hợp latency >100 ms, **H vẫn BLOCKED/NOT_MET**, chờ review kỹ thuật; CI xanh không tự khép H.

## Ranh giới dữ liệu và giấy phép

Không thêm dependency hoặc asset bên ngoài. Fixture và các ảnh sọc được tạo trong dự án; nguồn/giấy phép và đính chính font ở [ATTRIBUTION](../../../ATTRIBUTION.md). PNG QA chỉ là ảnh chụp app với dữ liệu tổng hợp. Không có ảnh thật, địa chỉ, tọa độ thực, gói riêng, hash gói riêng, dữ liệu hay kết quả đo của world riêng trong hồ sơ này.

Tự nhận diện mặt/biển số bằng ML là NOT_DONE có chủ ý; có làm mờ vùng thủ công và cổng xem lại từng ảnh trước public. GPU vật lý, native Safari/iOS/Android và thiết bị thật là NOT_VERIFIED. Giữ `BLOCKED_MISSING_GEOREFERENCE` / `REAL_WORLD_NOT_VERIFIED`. Không merge, Publish, deploy, mở P11–P13 hay đổi Lovable.
