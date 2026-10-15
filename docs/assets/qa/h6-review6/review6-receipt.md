# H6 Review 6 — QA receipt

## Scope

- Chỉ xử lý finding landscape mobile **740×390**: nút thu panel phải nhận click thường, đồng thời giữ scene, Plan, chỉ báo Bắc và thước mét tiếp cận được.
- V5-1/V5-2 được giữ nguyên; H4 không bị đụng tới.
- Không merge, auto-merge, Publish hay deploy.

## Source under test

- Repository: `sovergarden-dev/home-3d`
- Branch: `feat/h6-pho-that-mat-bang`
- PR: `#3`
- Code SHA đã kiểm thử và chụp QA: `68bd1b6cfb0ebef4455f3943904ae0b0adf9c85d`
- Fixture SHA-256: `2ec012a90a1a5698123281ada9805447c3478c92ab2339a57629906acfdcd602`

## Thay đổi

- Ở landscape thấp, panel mở nằm bên trái MapControls; handle thu gọn đặt vào khoảng trống dưới TopInfo.
- ScaleBar được chuyển lên trên Dock và sang khoảng trống bên phải để nhãn Bắc/thước cùng nút lớp không bị che.
- Không nâng z-index toàn panel và không thay đổi workflow/private state ngoài scope này.

## Regression 740×390

Playwright Chromium, WebGL renderer sẵn sàng:

1. `elementFromPoint` tại tâm nút thu xác nhận hit target là chính nút; gọi `locator.click()` thường (không `force`) và xác nhận panel thu gọn.
2. Xác nhận hit target của nhãn “Thước mét” vẫn nằm trong ScaleBar; click thường nút lớp cây hai lần và xác nhận trạng thái ban đầu được khôi phục.
3. Dùng click thường chuyển Diorama → Plan; mở lại panel.
4. Xác nhận selection `part-synthetic-h6-qa-part-left`, chiều cao phần `6.5 m` và Undo vẫn còn sau khi mở lại.
5. Không chỉ kiểm tra bounds/visibility; QA metadata ghi rõ các hit-test và hành động click.

## Kiểm thử cục bộ trên code SHA nêu trên

- `bun run check`: typecheck/build đạt; Vitest **15 file / 63 test**; pipeline **32 test / 157 assertions**, 0 fail. Lint có 6 cảnh báo Fast Refresh đã tồn tại ở các UI component dùng chung, 0 lỗi lint.
- `bun run test:e2e`: **33/33 đạt** trên Chromium, Firefox và WebKit.
- QA capture: H6 synthetic source E2E **1/1 đạt**; timeout 180 giây chỉ áp dụng cho lượt chụp nhiều ảnh, không thay đổi cấu hình test/CI mặc định.
- Browser: Chromium headless với SwiftShader; đây không phải benchmark GPU vật lý.

## Evidence

- `qa-capture-h6.json` chứa `codeSha`, fixture hash, build/roundtrip evidence và kết quả landscape regression.
- `16-h6-private-panel-mobile-landscape.png`: panel mở tại 740×390.
- `17-h6-private-panel-mobile-landscape-collapsed.png`: panel đã thu bằng click thường; Plan, Bắc và thước mét lộ rõ.
- Bundle cũng giữ các capture desktop/portrait, export overrides và bằng chứng roundtrip trong cùng lần chạy/SHA.

## CI dispatch

Kết quả `workflow_dispatch` đủ bốn job trên exact final PR head được ghi ở receipt comment trên PR #3, để không tạo commit mới sau khi CI đã kiểm tra head đó.
