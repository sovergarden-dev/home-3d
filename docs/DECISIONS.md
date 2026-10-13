# Quyết định hiện hành — Demo 1

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

## Quy trình phát hành

Notion AI tạo và kiểm patch. Hermes áp nguyên patch, chạy frozen install/check/e2e, mở PR và workflow_dispatch đúng SHA. Notion AI review CI trước merge. Syringa merge bằng merge commit, kiểm Lovable và Publish. Không force push hoặc tự merge.

## H6: world synthetic/public, package riêng/local

- Runtime public dựng đúng một `WorldData` synthetic. Không chồng grid/road/nhà thủ tục cũ lên world polygon.
- Mặt bằng dùng `OrthographicCamera` thật, Bắc lên trên, thước mét lấy từ frustum/zoom/canvas. Pan và zoom chỉ tác động camera local; renderer phát số đo sang store, không serialise world riêng.
- Pipeline, package parser và file picker đều nhận package local explicit. Package lỗi không fallback âm thầm sang fixture rồi gắn nhãn khu thật.
- Package thật, source snapshot, mapping, ENU, override và report ở ngoài git/build. Repo chỉ giữ schema, code, docs và fixture synthetic.

