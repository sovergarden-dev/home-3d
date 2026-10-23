# P10 — chứng cứ vòng 2

Chỉ fixture/ảnh tổng hợp. Không có gói, origin, companion, hình học hay ảnh khu thật. Kết quả CI/full head và receipt cuối nằm trên trang P10; không tự xác nhận kỹ thuật hoặc khả năng merge.

## Kiểm cục bộ

Frozen install; typecheck; lint 0 lỗi (7 cảnh báo); 362/362 unit trong 58 file; 39/39 pipeline trong 6 file; build; pipeline dry-run valid. Chromium full 77/77, Firefox full 77/77 và WebKit full 77/77, đều 0 fail/0 skip. Sau sửa harness điều hướng kép sau reload, chạy thêm đúng 6/6 storage Chromium; source app giữ nguyên. Giữ timeout 90 s, capability guard, assertion H6, workflow, dependency/lockfile và telemetry. GPU dùng môi trường kiểm phần mềm; không chứng nhận GPU vật lý/native Safari/iOS/Android.

Các lượt đỏ trước được giữ ngoài repo trong evidence cục bộ; không gộp chúng vào counts xanh. Những thay đổi setup cần thiết: nhập rỗng giờ là merge nên reset bằng clearAll rõ ràng; opt-in phải được nhớ; RAM của kho chỉ-đọc không tồn tại qua reload; bỏ goto trùng ngay sau reload gây NS_ERROR_FAILURE trên Firefox. Không nới assertion chức năng để che lỗi nguồn. Unit mới đã bắt lỗi merge vượt 300 mục; source hiện validate trước commit trạng thái.

## R1 và S2

[Postcard 2K](../postcard-2k.png), [gallery desktop](../gallery-1440x900.png), [canvas đối chứng](scene-screen.png), [số đo vùng cảnh](brightness-evidence.json). HDR HalfFloat → OutputPass ACES/sRGB → readPixels; giữ/khôi phục renderer state và dispose render target, material/geometry/texture tạm. So cùng vùng 1884×804 của cảnh, cùng camera 28/zoom 1, 07:00 ngày 2026-06-21, DPR 1. Viền, chữ và HUD không thuộc ROI. Chênh RGB 2.485/3.742/7.532%, độ sáng 4.404%, đều dưới ngưỡng 15%. Dock cao hơn và cuộn danh sách thật: ba tiêu đề thẻ xuất hiện. S1 tăng kích thước/diện tích chạm ghim chưa làm vì cần kiểm camera/touch riêng; vẫn dùng được thẻ/nút điều khiển có sẵn.

## R7: tách chi phí, không tuyên bố đạt độ trễ

Baseline vòng 2 đúng 0eb8967d3770dd2b37c55299ed51fb0c1b049b65; ba lượt mỗi bản, 30 mẫu/bản, cùng 299↔300 thẻ, viewport 1440×900/DPR1, thời điểm đóng băng và tắt lớp sống ở cả hai để cô lập ghim. Chạy tuần tự, cùng harness/warm-up. [Raw trước](r7-before-raw.json), [raw sau](r7-after-raw.json), [summary cùng phân loại add/delete](summary.json). Mỗi mẫu xác nhận đúng 299/300 lần ghi instance ghim; không đếm lớp sống. Mỗi lượt 0 page error, 0 host ngoài khác; font ở hai host cho phép bị abort.

Đơn vị ms; mỗi ô p50 / p95. Các khoảng chồng nhau, không cộng thành tổng.

| Phần đo                                                   |             Trước |               Sau |
| --------------------------------------------------------- | ----------------: | ----------------: |
| Mutation CPU (gồm clone/store)                            |     3.350 / 6.340 |     1.850 / 3.675 |
| structuredClone CPU                                       |     2.050 / 3.355 |     0.000 / 0.000 |
| Map.set CPU (giới hạn độ phân giải đồng hồ)               |     0.000 / 0.000 |     0.000 / 0.000 |
| Commit DOM: mốc từ MutationObserver, không phải CPU React | 127.050 / 521.420 | 104.050 / 450.905 |
| setMatrixAt CPU: cận dưới, không phải toàn bộ dựng ghim   |     0.200 / 0.400 |     0.200 / 0.300 |
| RAF1: cận trên UI/render/scheduler                        | 136.950 / 527.315 | 114.050 / 461.670 |
| RAF2: cận trên UI/render/scheduler/compositor             | 144.650 / 534.160 | 223.850 / 566.595 |
| RAF2 trừ RAF1: phần dư, không phải GPU timing             |    9.000 / 16.055 | 106.500 / 118.585 |

Bỏ clone toàn document ở mỗi publish (RAM giữ tham chiếu document bất biến sau mutation) giảm CPU synchronous; không bỏ validate/cap. DOM timestamp là độ trễ tới thay đổi thẻ, không phải React Profiler. Pin CPU chỉ gồm setMatrixAt, loại trừ phần dựng ma trận và công việc GPU. RAF/compositor là cận trên hỗn hợp; không đủ để kết luận GPU là nút thắt. RAF2 p50 sau cao hơn trước và vẫn trên 100 ms: **H_BLOCKED**, không gọi cải thiện CPU là đạt ngân sách UI. Cần review đường UI/render/scheduler tiếp; không mở pha mới.

## Soak mới

[Raw soak](soak-raw.json): complete=true, 1200000 ms, 21 chu kỳ, 0 page error; canvas=1, world=1, URL/Bitmap/IDB/AudioContext đang mở=0, RAF=1; render target=0, texture=3, geometry=42 ở mọi checkpoint. Heap used trong khoảng 72200000–72200000 byte, cuối 72200000 byte. Không thấy tăng không giới hạn trong lượt này; các số heap/renderer counter không phải GPU memory và không chứng minh mọi thiết bị đều không rò rỉ.

## Source đã kiểm

[tested-source-sha256.json](tested-source-sha256.json) ghi fingerprint bốn file rủi ro chính, đối chiếu trước commit cuối để gắn bằng chứng pre-commit với đúng source được push. Không nhúng SHA commit chứa chính artifact này để tránh vòng tự tham chiếu. Production smoke sau commit kiểm full build SHA bằng full HEAD và scan sentinel SSR/build; receipt Notion ghi kết quả thực đó.
