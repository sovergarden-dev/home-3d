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
