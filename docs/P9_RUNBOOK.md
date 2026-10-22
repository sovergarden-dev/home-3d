# P9 — Sự sống và âm thanh

P9 là lớp mô phỏng có seed, không phải giao thông, người, hàng quán hoặc chỉ đường thực địa. Phạm vi gốc: [scope P9](https://app.notion.com/p/e26beb96a134464fa5f46303ff86e64e). Chỉ fixture tổng hợp được dùng để kiểm thử và chụp ảnh.

## Mở bản local để xem tổng thể

Chạy `bun install --frozen-lockfile`, rồi `bun run dev --host 127.0.0.1`. Trang chính giữ canvas/dock hiện có. Trong Thời gian có Lớp sống, Mật độ mô phỏng và khe clip âm thanh; cụm camera có Đi bộ và Ngồi sau xe ôm. Dừng giữ tác nhân đứng yên; chọn 1× để thấy chuyển động. Mặt bằng luôn ẩn tác nhân.

Đi bộ dùng mắt cao 1,6 m, WASD/mũi tên hoặc các nút cảm ứng, kéo để nhìn; chuột có thể khóa bằng thao tác riêng và thả bằng Esc. Xe ôm chỉ đi theo tuyến mô phỏng trên đồ thị, có Tạm dừng/Thoát và trạng thái kết thúc. Nghiêng điện thoại là opt-in; từ chối/không hỗ trợ vẫn kéo được. Thoát trả lại camera trước POV, không reset selection, undo hay gói.

## Đồng hồ, đồ thị và nguồn dữ liệu

Điều khiển Dừng/1×/4× của P8 dùng chung; đồng hồ lịch P8 vẫn là 1 phút/giây tại 1× theo quy ước đã được chấp nhận, còn vận tốc tác nhân tại 1× là một giây chuyển động/giây thực. P9 tích phân bước cố định 1/30 giây, kẹp dt và bỏ catch-up khi ẩn tab; không tạo vòng RAF/timer riêng. Đổi giờ/mật độ/lớp/mode không dựng lại world.

Đường và footprint đang hiển thị được đọc để tạo đồ thị và BVH client-only. Làn/lối đi/bề rộng thiếu là inferred, không ghi ngược vào working package. Đồ thị thiếu đoạn sử dụng được làm lớp sống tắt có lý do; khi hành lang bị footprint chặn, có thể không tạo tác nhân thay vì xuyên hình học. Tác nhân đi trên các cạnh nối tại nút có cùng tầng/cấu trúc, có làn/lối đi suy ra, ưu tiên giao lộ xác định và khoảng cách vật lý bảo thủ; cuối mạng không có cạnh ra thì fade rồi tái bố trí an toàn, không vòng/teleport trên cạnh đang thấy. Footprint và mọi lô (kể cả lô trống) là vùng tránh; đoạn suy ra bị vật cản cắt có thể bị bỏ hoàn toàn thay vì đoán đường vòng. Ranh va chạm là ranh fixture/gói, không phải xác nhận ranh thửa. Footprint thiếu chiều cao dùng tường va chạm bảo thủ cao 3 m; không thay chiều cao nguồn.

Giới hạn tổng xe + người + hàng rong + động vật: low 60, mid 200, high 800, ultra 2000; FPS đo thực có thể hạ tier. Instancing có tối đa 10 batch thân + một batch đèn chung; bóng vật lý của từng tác nhân được tắt để giữ ngân sách. Hình đơn giản và bánh là procedural, không cam kết chi tiết người/biển số hoặc mô hình giao thông chính xác. Không tự kích hoạt georeference, Google, thời tiết thật hoặc API giao thông. Giữ `BLOCKED_MISSING_GEOREFERENCE` / `REAL_WORLD_NOT_VERIFIED`.

## Tiếng phố và clip cục bộ

Mặc định là âm thanh tổng hợp (loop 6 giây có chặn biên, gain theo giờ/thời tiết và voice xe có định vị), không dùng bản thu phố thật. Không mô phỏng hội thoại người thật hoặc tuyên bố các tone là bản thu chợ/chùa. AudioContext chỉ tạo sau thao tác bật tiếng/nạp clip, tối đa một context trong scene; ẩn tab/pagehide/tắt tiếng/đổi gói/rời route dừng tiếng và dọn voice/listener.

Khe clip ở Thời gian → Nạp clip cục bộ nhận manifest JSON và tệp audio tối đa 1.000.000 byte. Manifest có `name`, `size`, `type`, `sha256` (64 ký tự hex). Ví dụ chỉ dùng clip tự tổng hợp:

```json
{
  "name": "synthetic.wav",
  "size": 1644,
  "type": "audio/wav",
  "sha256": "<SHA-256 của chính bytes clip>"
}
```

Tệp/manifest chỉ ở phiên trình duyệt, không upload, không lưu localStorage/IndexedDB và không nằm trong export world. Thiếu/lỗi clip dùng tổng hợp. Thư mục tùy chọn `src/engine/life/audio-local/` bị gitignore; không tự fetch đường dẫn, không tải từ bên thứ ba, không xin micro. Không commit audio hoặc asset trên 1 MB. Muốn tạo manifest cho clip riêng phải làm bên ngoài repo; tên/hash clip riêng không đưa vào PR/Notion/log.

## Cổng kiểm chứng

- Frozen install; `bun run check`; pipeline synthetic dry-run.
- Full Playwright Chromium/Firefox/WebKit trên đúng mã cuối. Chromium yêu cầu WebGL2; fallback/GPU skips ở hai browser còn lại phải báo riêng, không gọi GPU pass.
- Production build và local smoke, không deploy. Pixel/capture thật, mobile 390×844, landscape 740×390, VI/EN, reduced-motion, context recovery, no-network sentinel.
- Benchmark before là `main` full SHA `7221b0c416633d2bd4273afdbd77b894b9ac5f23`; ba lượt cùng fixture/camera/giờ/viewport/DPR. Giữ raw slow frame; tách idle/parse/build/capture. Ngưỡng đặt trước: chi phí update P9 tier mid p95 ≤ 4 ms CPU; latency đổi presentation mục tiêu <100 ms sau warm-up. SwiftShader không chứng nhận GPU vật lý.
- Soak ≥20 phút/≥20 chu kỳ có raw retained-JS-memory estimate, AudioContext/node/listener/RAF. Estimate không phải GPU memory.
- Một `workflow_dispatch` cuối ở stable full head với bốn job tên hiện hữu; không sửa workflow/guard để làm xanh.

Kết quả chạy, counts, skips, raw artifacts và giới hạn được ghi trong receipt cuối trên scope/PR, không lấy dự định ở runbook này làm bằng chứng đã đạt.

## Ranh giới bàn giao

Nhánh `feat/p9-life-sound`, PR thường vào `main`, không stacked. Chỉ `SUBMITTED_FOR_TECHNICAL_REVIEW`; Notion AI quyết định review. Không merge/auto-merge/Publish/deploy, đổi Lovable sync/settings, viết lại lịch sử đã push, xóa nhánh hoặc mở P10–P13. Không giao checklist QA lẻ cho chủ dự án. GPU vật lý, native Safari/iOS/Android và khu thật chưa chạy ghi NOT_VERIFIED, không suy từ headless.

## Batch review vòng 1 — P9-R1…R4

Đối chứng WebKit H6 20 vòng trên main `7221b0c` và P9 cũ `9c6893c`, cùng máy ba lượt: tách mở gói, Mặt bằng/Đi bộ/Diorama, capture, Giới thiệu/Về phố/ready; ghi mountWorld/createLifeRuntime, enter/exit POV và frame. Probe bên ngoài dùng weak references để không tự giữ renderer/canvas; số context logic đã lost không phải bằng chứng driver đã thu hồi VRAM. So với bảng từng bài CI P8 `d93b908`, không quy chậm do hạ tầng nếu chưa có bằng chứng.

Bản sửa dùng demand render cho Walk đứng yên, vẫn đánh thức bằng input/pose và giữ frame cuối. Dispose mọi batch instance, kể cả đèn, và detach group cũ. Tách constructor/resume AudioContext, tổng hợp buffer/node và draw đầu; context vẫn chỉ tạo trong gesture. Nếu phần first-draw còn vượt 100 ms trên SwiftShader thì giữ NOT_MET, không đổi ngưỡng. BVH là mã riêng `src/engine/life/collision.ts`; `three-mesh-bvh` không cài, không thêm dependency.

Trước nộp: ít nhất năm lượt WebKit H6 liên tiếp nguyên bài; frozen install/full check/pipeline dry-run/ba browser/production smoke cùng mã cuối. Mục tiêu H6 WebKit CI ≤70 giây, test timeout vẫn 90 giây. Chỉ một workflow_dispatch mới tại head mới; nếu đỏ thì dừng, giữ trace + bảng pha cho reviewer, không dispatch lại hoặc rerun run cũ `39654782393`. Kết quả thực ở receipt, không lấy hướng dẫn này làm bằng chứng đã đạt.
