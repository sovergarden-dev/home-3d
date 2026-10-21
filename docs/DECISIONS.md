# Quyết định — H6 hiện hành, Demo 1 lịch sử

## H6 — một gói tích hợp, một lượt review

- Theo trang “H6 — Cue làm trọn gói, nghiệm thu một lần”: Cue khép W0–W7 và tự kiểm T01–T20 trong PR #3; Notion AI review kỹ thuật receipt cuối; Syringa chỉ nghiệm thu tổng thể sau đó. Không merge/auto-merge/Publish/deploy.
- Zustand chung chỉ chứa điều khiển UI an toàn. World, package base, overrides, lịch sử và selection/marker theo phiên ở client; không persistence, cloud hoặc SSR serialization dữ liệu riêng.
- UI mặc định có đường mở gói; query `local-preview=1` cũ vẫn tương thích. Synthetic mở từ file vẫn là dữ liệu tổng hợp. Gói lỗi có trạng thái riêng, không lén thay bằng demo.
- Đọc file dùng generation: yêu cầu mới nhất hoặc reset thắng mọi kết quả cũ. Giới hạn 100 MiB cao hơn canonical hiện có. Mã lỗi không chứa nội dung/tên file riêng.
- Bản làm việc dùng schema WorldPackage hiện hữu: base nguyên vẹn cộng document overrides hiện hành, không xuất effective world rồi áp overrides lần hai. Giữ metadata/xác nhận tâm; marker không được xuất thành lots/overrides. Download là yêu cầu trình duyệt tải file, không bằng chứng file đã lưu thành công.
- Chỉnh một thuộc tính chỉ patch thuộc tính đó, provenance thuộc tính khác giữ nguyên. Unknown không phải số đo 0 m; màu chất lượng chỉ là trình bày từ `assessWallHeight`, không xác minh hình học/tầng/mái.
- Lõi và tâm private đã chấp nhận được bảo toàn; toàn dữ liệu chỉ fit khi chủ động chọn. Minh họa lô là opt-in theo package, không phải ranh khảo sát. Không re-intake/Overture mới hoặc bịa khối nhà.
- Build chỉ hiển thị SHA đầy đủ thực sự được truyền qua `VITE_BUILD_SHA`; không có thì “không xác định”. Không gọi GitHub từ runtime hoặc tự gán SHA PR. Không suy build Preview đang phục vụ từ trạng thái PR.
- Bằng chứng mới chỉ dùng fixture tổng hợp độc lập. Frame interval là giữa các frame đã render trong cửa sổ hoạt động, không GPU time/FPS thiết bị; hardware/Preview thiếu chứng cứ ghi NOT_VERIFIED. Perf before/after phải cùng fixture/path/viewport/DPR.
- Cleanup `SceneViewport` chạy ở layout effect, trước khi React tháo canvas, để OrbitControls gỡ listener khỏi đúng document. Sonner 2.0.7 được vá bằng Bun patch hai dòng ESM/CJS: tháo `visibilitychange` trên document đã đăng ký, không nâng dependency. Hai regression riêng bảo vệ đúng thứ tự và đúng event target.
- Soak dùng File/DataTransfer qua input/UI thật để tránh alias input đã tháo bị driver giữ; E2E riêng vẫn dùng `setInputFiles`. Guard retained-growth giữ raw samples, so peak sau warm-up qua 20 vòng và 20 phút; không suy GPU memory hay chứng nhận phần cứng từ JS heap.

## Lịch sử Demo 1

## Demo trước, chi tiết sau

Sau P1.1, chủ dự án yêu cầu gom một lát cắt demo chạy được thay vì đợi hoàn thành từng pha P2–P13. Demo 1 không đồng nghĩa các pha đó đã hoàn tất. Những hạng mục còn lại nằm trong BACKLOG.

## Mã nguồn public, dữ liệu riêng không public

Repo giữ public theo quyết định mới. Bản Lovable và bản HTML xem thử chỉ dùng phố hư cấu. Không có địa chỉ, tọa độ địa lý, link vị trí, polygon lô thật, ảnh riêng, ảnh Google, API key hay endpoint dữ liệu thật. Không triển khai Cloudflare/R2/Access trong lần này. `noindex` không phải cơ chế bảo mật.

## Model và engine demo

- Layout sinh từ seed cố định, hoàn toàn hư cấu; không truy vết, đo hoặc suy ra hình học từ Google Maps/Street View. Dữ liệu thật sau này dùng dữ liệu mở được phép và ảnh người dùng tự chụp.
- Nhà trung tâm là lô trống. Không dựng lại nhà cũ; chưa có model kiến trúc sư.
- Three.js trực tiếp + OrbitControls, lazy-import phía client. Giữ TanStack Start, bun và store; không đổi cấu trúc Lovable. R3F/drei trong kế hoạch là hướng kiến trúc cho các pha engine đầy đủ, chưa là dependency bắt buộc của lát cắt demo.
- InstancedMesh dùng chung geometry/material; không đưa asset nặng vào git. Camera mặc định Diorama, điều khiển zoom/heading qua store. Reset khôi phục cả góc nghiêng camera.
- Tầm mắt là preview góc camera, không phải đi bộ có va chạm. Phố thật bị vô hiệu hóa; thời tiết chỉ mô phỏng, không lấy vị trí.
- Ánh sáng là mô phỏng theo giờ, không phải nắng theo tọa độ thật. Giờ thật/thứ theo Asia/Ho_Chi_Minh.
- Âm thanh tổng hợp sau tương tác bật tiếng; không phải bản thu phố thật. Tạm dừng khi tab ẩn.
- Ảnh chụp chỉ giữ tối đa 4 ảnh trong bộ nhớ phiên, tải PNG được; không lưu lên server/localStorage. Reload xoá ảnh.
- WebGL2 không có/mất context: hiện thông báo và nút thử lại. Chưa có ảnh/video fallback của phố.

## Quy trình phát hành lịch sử (phân vai H6 ở trên)

Notion AI tạo và kiểm patch. Hermes áp nguyên patch, chạy frozen install/check/e2e, mở PR và workflow_dispatch đúng SHA. Notion AI review CI trước merge. Syringa merge bằng merge commit, kiểm Lovable và Publish. Không force push hoặc tự merge.

## H6: world synthetic/public, package riêng/local

- Runtime public dựng đúng một `WorldData` synthetic. Không chồng grid/road/nhà thủ tục cũ lên world polygon.
- Mặt bằng dùng `OrthographicCamera` thật, Bắc lên trên, thước mét lấy từ frustum/zoom/canvas. Pan và zoom chỉ tác động camera local; renderer phát số đo sang store, không serialise world riêng.
- Pipeline, package parser và file picker đều nhận package local explicit. Package lỗi không fallback âm thầm sang fixture rồi gắn nhãn khu thật.
- Package thật, source snapshot, mapping, ENU, override và report ở ngoài git/build. Repo chỉ giữ schema, code, docs và fixture synthetic.

## P8 — Presentation và quyền thời tiết riêng

- Ngày UTC+7 là nguồn chung cho đồng hồ, lịch Việt, mùa, lễ và thiên văn. Mô phỏng 1× = một phút/giây thực; tab ẩn không bắt kịp thời gian mô phỏng.
- Không khí là lớp tách khỏi WorldData. Mùa tự động dùng quy ước mô phỏng miền Nam (tháng 5–11 mưa), không phải quan trắc khu nhà. Ngập là hiệu ứng mặt nước tắt được, không phải cao độ/rủi ro.
- Tham chiếu dùng binding P7 của đúng gói trong phiên. Không lấy demo làm vị trí khu thật. Consent Google không cấp quyền cho Open-Meteo; quyền thời tiết chỉ ở client session và bị xóa khi đổi gói/reference/reset.
- Không thêm backend/key/hạ tầng. Asset trang trí procedural tự tạo; không tải nội dung Google làm model/texture. Thiết bị/GPU vật lý chưa kiểm ghi NOT_VERIFIED.

## P9 — Lớp sống/âm thanh và POV client-only

- P9 từ main `7221b0c416633d2bd4273afdbd77b894b9ac5f23`, PR thường, không stack H6/P7/P8. Lõi các pha đã nhận giữ nguyên; thay nhãn Đi bộ cũ thành POV thực có BVH; hành vi export P7 vẫn dùng hợp đồng mode `walk` khi camera ở POV.
- Chung vòng render/đồng hồ P8, không thêm RAF/timer. Dừng đứng yên, 1× = 1 giây chuyển động/giây thực, 4× = bốn lần có bước cố định 1/30 giây. Đồng hồ lịch P8 vẫn giữ quy ước một phút/giây tại1×; không sửa pha đã chấp nhận. Tab ẩn bỏ catch-up; reduced-motion bỏ head bob và giảm tốc/nhìn rung.
- Đồ thị/làn/lối đi suy ra là bộ nhớ trình bày, không ghi vào roads/footprints. BVH CPU tường footprint bảo thủ (thiếu chiều cao dùng3m), mặt đất/biên gói, vật cản xe buffer tái dùng; không dependency vật lý/audio mới. Xe ôm chỉ một tuyến đồ thị hữu hạn nối liên tục từ tâm tới nút hợp lệ; fixture có nhãn đích giả; không chỉ đường thật.
- Nút tắt nhanh lớp sống luôn thấy; Mặt bằng trung tính không tác nhân. AudioContext chỉ tạo bằng thao tác âm thanh thực, một context trong scene; tổng hợp/clip local manifestSHA256≤1.000.000byte. Không fetch/micro/storage/upload. Thư mục audio-local gitignored; asset procedural tự tạo.
- Ngưỡng CPU update tiermid đặt trước ≤4ms p95; latency mục tiêu<100ms. So sánh perf phải cùng fixture/time/camera/DPR, rawslowframe không lọc; JS heap estimate không phải GPUmemory. Thiết bị/GPU vật lý/nativeSafari/khu thật chưa đo ghi NOT_VERIFIED. Chi tiết và giới hạn trong runbook/receipt, không đổi ngưỡng để gọi đạt.
