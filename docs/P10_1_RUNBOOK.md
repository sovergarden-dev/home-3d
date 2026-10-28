# P10.1 — Kỷ niệm, ghim và bưu thiếp

`PARTIAL` — M0 đã merge, nhánh M1 đã nhận main bằng merge; chưa mở PR M1. Phạm vi hiện hành từ CODEX_HANDOFF (M1).

## K3 — Chú thích bưu thiếp

- Giữ nguyên câu tiêu đề cố định, kích thước xuất/hạ bậc, vùng cảnh, quét metadata, Hủy và chia sẻ.
- Dùng TextMetrics của canvas thật để đặt hai hộp chữ. Gap bằng 0,6 lần line-height nhỏ hơn; line-height là 1,2 lần cỡ chữ, không dựa vào việc có hay không tên phường. Chiều cao mực chữ đo được chỉ dùng để đặt baseline và tránh chồng lấn.
- Căn chữ theo lề ảnh; co cỡ chữ theo chiều rộng thực khi cần, không dùng `fillText(maxWidth)` làm lệch bounding box. Hình học frame/ROI được dùng chung cho capture, compose và caption để giữ vùng cảnh R1.
- Cần kiểm: canvas thật tại 3840×2160, 2048×1152, 1920×1080; VI/EN; tên phường rỗng, 40 ký tự và có dấu; ảnh 4K/2K; R1 chênh màu dưới 15%; regression P10. Chưa gọi DONE từ code hoặc mock.

## K1 và K2

K1: profile 10 cặp có tracing chỉ ra react-dom là phần chậm; memo card và guest-only viewport subscription giảm DOM p50 83,35 → 22,95 ms và RAF2 100,9 → 35,5 ms. 26 regression unit đạt; không sửa validator, quota hay persistence. Vẫn cần ma trận A/B đủ mẫu trước khi chốt H.

K2: pin billboard 20 CSS px, vùng chọn tròn 44 CSS px, một InstancedMesh; gần điểm chạm nhất thắng, exact tie theo ID ổn định. Pin active vẽ cuối trong cùng batch để outline không bị pin trùng che; nhãn/marker nhà giữ ưu tiên. Chỉ hiện ở Diorama/Mặt bằng. Tám unit về tier/privacy/picking/highlight đạt; pixel QA, touch/overlap và regression H6 đang kiểm. Chưa DONE.

K2 đã kiểm Chromium: 12 ca pixel ở ba viewport × hai mode × gần/xa; hai ca hit/overlap, rồi hai ca touch CDP và regression picking/geometry H6 đều đạt. Các phép đo dùng ảnh canvas thật so với background cùng scene, không đo hình giả lập bằng CSS. Vẫn cần các browser còn lại, ảnh và lifecycle chung.

## Ma trận độ trễ nghiệm thu

`scripts/p10-1-latency.mjs` chạy AB rồi BA xen kẽ, sáu batch × mười cặp add/delete cho mỗi nguồn/điều kiện. Hai nguồn phải khai báo full SHA và được đối chiếu với server. Có active-300 (như baseline M0), static-300 (như R7), smaller-300 và active-empty. Primary phải đạt cả active và static, giữ trần 100 ms. Frame phản ánh chỉ được ghi sau khi DOM có đúng số thẻ, mesh thật có đúng số instance, GPU fence đã hoàn tất và qua một RAF kế tiếp; vẫn ghi RAF1/RAF2 riêng. Đây là cận trên cơ hội trình bày, không phải thời gian GPU. Timeout/censored giữ trong raw và không được coi là complete. Trace R7 là chẩn đoán riêng, không trộn vào số nghiệm thu.

### Lượt đo K1 bị dừng do setup tier

Lượt `latency-real` đầu đã hoàn tất active/static nhưng condition 960×600 khởi tạo scene tier mid chỉ có 120 pin. Probe yêu cầu draw 300 nên timeout; đây là lỗi protocol, không là lỗi app. Dừng ngay sau phát hiện, giữ nguyên toàn bộ raw kể cả censored. Harness sửa bằng khởi tạo cùng 1440×900/high, sau đó resize viewport trước warm-up và xác nhận số pin thực bằng dataset. Không đổi cap app hay ngưỡng. Ma trận đủ mẫu của harness đã sửa mới dùng để chốt nhãn.

### K1 GPU thật đã đủ mẫu

`latency-real-final` tại `0265a53b9e8b571b18fd19ad496e0c9ccdad181d` kết thúc `H_MET_REAL_GPU`, Chrome 152.0.7977.76 / Intel UHD ANGLE D3D11 / driver 32.0.101.7082 / DPR 1. Đủ 60 add và 60 delete cho mỗi condition/source; môi trường A/B đối chiếu, mọi sample REFLECTED, không page error. Active-300 add p50/p95 86,50/103,30 ms; delete 84,75/98,80 ms. Static-300 add 66,25/68,40 ms; delete 51,30/66,60 ms. Không tuyên bố p95 dưới 100 ms. Smaller và zero giữ trong raw/summary. Đây là cận trên cơ hội trình bày sau GPU fence, không GPU execution time. SwiftShader, H6/soak và gallery/R1 vẫn chưa hoàn tất; M1 chưa DONE.

SwiftShader khởi động cùng lúc quét privacy/gitleaks; đã dừng để không trộn tải CPU kiểm tra vào đối chứng renderer phần mềm. Giữ dữ liệu nếu đã có, chạy lại khi các scan đã kết thúc. Không dùng lượt startup bị dừng để chốt nhãn.
