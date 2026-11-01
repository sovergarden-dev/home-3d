# Evidence M1

Tất cả dữ liệu và ảnh đều tổng hợp. Runtime cuối: `59f6d6881261a542e1f1b52b4d0d2d6e86f4834a`; commit công cụ đã kiểm CI: `ddc3246b38fea900c3e9413d146061fbaa2a7861`. Xem [runbook](../../../../P10_1_RUNBOOK.md) để đọc method và giới hạn.

| Evidence hiện hành                                                    | Nội dung                                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `latency-real-empty-layer/`                                           | Matrix đủ mẫu ở runtime cuối, H_MET_REAL_GPU cho 300 ghim; ca 0↔1 là diagnostic NOT_MET riêng |
| `h6-real-empty-layer.json`                                            | H6 native GPU 41,481 giây, baseline Windows 44,351 giây                                       |
| `soak-real-empty-layer/`                                              | 10 phút / 11 vòng, resource và heap raw                                                       |
| `ci-40777137757.json`                                                 | CI 4/4, H6 WebKit cùng runner 58,262→57,605 giây                                              |
| `production-current/`                                                 | Built Worker smoke đúng SHA, UI và privacy checks                                             |
| `empty-pin-before.json`, `empty-pin-after.json`                       | Actual shaderSource probe đỏ 4→4, sau sửa xanh 4→0; không phải số đo tốc độ                   |
| `k2-initial-receipt.json`, `m1-k2-firefox-webkit-receipt.json`        | 36 pixel measurements, 6 hit/overlap cases ở ba browser                                       |
| `k3-after-receipt.json`, `k3-webkit-fixed-receipt.json`               | 54 ca bbox; giữ cả 18 lỗi import harness trước khi sửa                                        |
| `color-real/`, `visuals-real/`, `visuals-time/`, `visual-review.json` | R1, PNG 4K/2K, gallery 12 góc ghim và visual inspection                                       |
| `stationary-frame-comparison.json`                                    | Rolling engine snapshots sau warm-up, không phải GPU execution time                           |

## Lượt lịch sử và giới hạn

`latency-real` là lượt dừng vì viewport khởi tạo sai tier. `latency-real-verified` là source1331034 chưa đạt. `latency-real-final`, `soak-real`, `h6-real.json` là source0265a53, không đổi thành số đo runtime cuối. Tên thư mục "final" của lượt trước được giữ nguyên để không xoá/đổi bằng chứng; luôn đọc `environment.sourceSha`.

`latency-swiftshader`, `swiftshader-isolated-static` và `latency-swiftshader-final` giữ các lượt software và toàn bộ censored sample. Verdict software H_BLOCKED ở source0265a53; chưa tái đo software toàn bộ sau sửa empty-layer. Không dùng median của tập sống sót để tuyên bố đạt hoặc cải thiện toàn bộ. Standalone fence diagnostic chỉ chứng minh API hoạt động dưới tải nhẹ.

`ci-40750407968.json`, `ci-40774796288.json` giữ các cổng chưa đạt/lỗi tooling. `h6-baseline-windows-webkit.json`, `h6-windows-webkit-comparison.json` giữ timeout của cả baseline/candidate Windows WebKit. `windows-regression-interrupted.json` chỉ có các kết quả đã quan sát trước khi dừng để sửa runtime, không phải full-suite pass.

`production-empty-layer/source-mismatch.json` giữ lần assertion từ chối build cũ. Không nới assertion SHA. Các profile R7 là diagnostic với tracing, không trộn vào sample nghiệm thu. Hai URL HMR WebSocket đã được che trước push; event count và timestamp/duration giữ nguyên, checksum gzip cập nhật.

Các JSON receipt gọn trỏ tên report cục bộ chỉ để truy nguồn; không chứa đường dẫn máy. Raw Playwright trace có đường dẫn local được giữ ngoài repo, không upload nguyên xi. File public đều dưới 1 MB. Heap/renderer counter không chứng nhận GPU memory; native Safari/điện thoại/khu thật vẫn NOT_VERIFIED.
