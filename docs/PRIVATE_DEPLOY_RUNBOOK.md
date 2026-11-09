# Bản riêng tư trên Workers + Access

`READY_TO_DEPLOY_NOT_DEPLOYED`: mã đã vào main qua PR #11; dry run và Worker native với dữ liệu tổng hợp đạt trên Windows và Linux CI; runbook đã rà đủ các mục M4 (Access chỉ email người nhà, secret, R2, domain tuỳ chọn, analytics không cookie, kiểm sau deploy, rollback) và có checklist riêng tư ở cuối file. Chưa deploy: Codex không đăng nhập hay deploy; chỉ chủ dự án thực hiện các bước dịch vụ sau audit.

## Phạm vi v1

Cùng bundle ứng dụng chạy ở cả Lovable và Workers riêng. Lovable luôn trả runtime `demo`. Entry riêng bọc Worker đã build và xác minh Access tại `/api/private-runtime`; response hợp lệ chỉ có `mode: private` và `packageSource: local-file`. Không trả JWT, email, vị trí, world hoặc companion. Gói và tham chiếu G1 vẫn do người xem chọn từ máy; các kiểm tra binding và consent hiện có giữ nguyên.

Private entry, cấu hình và lệnh nằm ở `private/entry.ts`, `wrangler.private.jsonc`, `scripts/private-deploy.mjs`. Cấu hình này không thay build Lovable. `workers_dev` và preview URL tắt; không có route/domain/tài khoản thật trong repo. `nodejs_compat` phục vụ bundle Nitro hiện hữu. Smoke Workerd cục bộ (bước 4 dưới đây, cũng chạy trong job quality của CI) lấy `compatibility_date` và `compatibility_flags` từ chính `wrangler.private.jsonc`, nên lượt đạt kiểm đúng cấu hình sẽ deploy. Script dừng nếu ngày sai định dạng, cờ không hợp lệ hoặc ngày mới hơn ngày Workerd cục bộ hỗ trợ. Vì vậy file cấu hình giữ dạng JSON thuần (không comment); unit test `private-checklist` khoá đúng các khoá đã rà.

## Kiểm cục bộ trước khi bàn giao

1. Dùng Bun 1.4.3; chạy frozen install, check, test liên quan và build theo cổng chung. Không nới guard tuổi dependency.
2. Dùng Wrangler CLI đã kiểm trong toolchain riêng của Home 3D. Không thêm native/postinstall dependency vào build Lovable. Gán biến tiến trình `HOME3D_WRANGLER_CLI` tới entry JavaScript của CLI đó.
3. `bun run deploy:private` mặc định dry run, chưa yêu cầu upload. Chỉ chạy khi đã kiểm đường đi của CLI không cần tài khoản cho dry run. Không chạy `--deploy` trong QA của Codex.
4. Chạy Worker cục bộ bằng cấu hình riêng với binding tổng hợp; kiểm thiếu/sai JWT chỉ trả demo, response `no-store`, app vẫn mở được. Unit dùng khoá ký sinh tạm, JWKS mock, kiểm signature/issuer/audience/expiry/nbf/rotation/error và không lộ dữ liệu. Không nạp secret thật để test.
5. Kiểm client bundle không chứa verifier/secret và không thêm host mạng của trình duyệt. Service Worker không cache endpoint runtime, API hay file riêng. Lưu kết quả thật vào CODEX_LOG/AUDIT_PACKET.
6. Tuỳ chọn, chạy tay (không có trong CI): sau `bun run build`, `bun scripts/private-production-smoke.ts` chạy build production qua Worker riêng trên loopback cổng 4195 với khoá ký sinh tạm và JWT tổng hợp, rồi mở Chromium. Kiểm: thiếu hoặc sai JWT trả demo, JWT hợp lệ trả private, HTML SSR không chứa token, email hay audience, 0 host ngoài, endpoint runtime không vào CacheStorage. Kết quả ghi vào thư mục `PRIVATE_SMOKE_OUTPUT` (mặc định `test-results/private-production`).

Toolchain QA đã kiểm: Wrangler 4.151.3, Workerd 1.20261019.1, Miniflare 5.20261019.1-beta, Node 22.22.0 trên Windows. Dry run và Worker native đầy đủ đã đạt trên Windows bằng JWT/key sinh tạm, JWKS local và ASSETS file-backed. Linux CI cũng đạt ở bước `Verify private Worker locally (no deployment)` của job quality (4 nhóm kiểm, 0 outbound bất ngờ; gần nhất CI main `41263307199` ở `beacd9b`). Đây không phải xác nhận policy Access hay host thật.

Khi tái lập native smoke, đặt HOME3D_QA_TOOLS tới toolchain QA đã kiểm ở ngoài repo; dùng scripts/private-workerd-smoke.mjs với ba đối số: checkout, bundle entry.js từ dry run, thư mục evidence tổng hợp. Harness đặt modulesRoot đúng thư mục bundle; không bỏ tham số này khi bundle nằm ngoài checkout. Không cấp credential hoặc chuyển sang upload để sửa lỗi local.

## Chủ dự án cấu hình dịch vụ sau audit

1. Chọn tài khoản, gói và domain của mình. Nếu dịch vụ yêu cầu chi phí hoặc tài khoản mới, chủ dự án quyết định; không mặc định bật thêm dịch vụ.
2. Tạo Access application cho toàn bộ hostname/path của bản riêng tư. Allow policy chỉ chứa các email người nhà được chủ dự án chọn. Không dùng Bypass hoặc public allow rule. Đọc [hướng dẫn Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) và [cấu hình Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/) khi thao tác trên tài khoản.
3. Giữ workers.dev và preview URL tắt để tránh một hostname phụ ngoài chính sách Access. Chỉ gắn domain sau khi Access đã được kiểm. Repo không giữ domain riêng, email hay account ID.
4. Đặt các binding dưới dạng secret/runtime của Worker: `HOME3D_PRIVATE_ENABLED=1`, `HOME3D_ACCESS_TEAM_DOMAIN` là hostname team dạng `…cloudflareaccess.com`, `HOME3D_ACCESS_AUD` là audience tag của đúng application. Không đặt vào `VITE_*`, `.env` public, PR, CI hoặc log. Nhập secret qua kênh nhập kín của công cụ; không đặt giá trị vào dòng lệnh hay dán JWT vào website kiểm token.
5. Chủ dự án tự đăng nhập CLI khi cần. Sau khi audit chấp thuận và dry run đạt, chủ dự án mới chạy `bun run deploy:private --deploy`. Lệnh này bị từ chối trong CI. Codex không chạy bước này.

## Kiểm sau deploy — chủ dự án làm

- Cửa sổ chưa đăng nhập phải gặp Access; tài khoản ngoài danh sách không vào được. Kiểm cả domain chính và các hostname thay thế.
- Sau khi đăng nhập đúng, ứng dụng hiện “Truy cập riêng tư đã xác minh”; endpoint runtime trả đúng hai trường cho chế độ private và header `Cache-Control: no-store, private`. Không sao chép token/header nhận dạng vào báo cáo.
- Trước khi mở file, world vẫn là demo. Chọn gói và companion từ thư mục riêng ngoài repo/OneDrive; kiểm G1 khớp gói. Phố thật và thời tiết thật vẫn cần xác nhận từng lần.
- Reload/đổi gói phải giữ đúng các quy tắc RAM, persistence opt-in và xoá tham chiếu của app. Badge chỉ là trạng thái xác minh lúc mở trang, không phải credential cấp quyền cho request sau.
- Kiểm CacheStorage chỉ có asset và offline shell tổng hợp có hash. Không có JSON runtime, package, companion, ảnh riêng hoặc nội dung Google. Không đưa ảnh nghiệm thu khu thật vào repo/CI.
- Ghi aggregate pass/fail và version/SHA đã thấy; không ghi vị trí, đường dẫn riêng, email, token hoặc ảnh khu thật.

## Tuỳ chọn và rollback

R2 private là v2 `NOT_DONE`, không cần cho v1 chọn file. Nếu làm sau này: bucket riêng, chỉ đọc qua Worker đã kiểm Access; đánh giá lại cache, quyền và logging trước khi sử dụng. Không có migration/database trong v1.

### Analytics không cookie (tuỳ chọn, mặc định Tắt)

Mặc định Tắt (bảng câu hỏi ở CODEX_HANDOFF §5.3). Bản riêng tư không có mã analytics, cookie hay beacon; cấu hình Worker không bật log (unit test `private-checklist`).

- Chỉ cần biết có người dùng: xem số liệu tổng hợp sẵn có của Worker trong dashboard (số request, lỗi); không cần script phía trình duyệt hay cookie.
- Không bật tính năng tự chèn beacon analytics vào HTML của domain riêng: beacon tải script từ host ngoài, trái quy tắc không thêm host mạng.
- Không bật Workers Logs, Logpush hoặc log request đầy đủ khi chưa rà nội dung: log có thể ghi URL và header của request, gồm JWT Access mang email.
- Muốn analytics phía trình duyệt thì mở PR riêng: công cụ không cookie, tự host hoặc cùng origin, cập nhật test mạng và DECISIONS, review riêng tư. Không bật từ dashboard.

Chủ dự án dùng cơ chế rollback phiên bản của Cloudflare để quay về bản đã kiểm, rồi lặp lại kiểm Access và endpoint. Không force-push hoặc viết lại Git. Nếu cần build lại phiên bản cũ, dùng tag/commit trong checkout riêng. Tag `baseline/p10-published` và lịch sử Lovable là hai điểm khôi phục của bản công khai; Publish Lovable vẫn là thao tác riêng của chủ dự án sau audit.

## Giới hạn runtime đang điều tra

Ba lỗi startup Windows lịch sử được giữ trong evidence. Linux CI sau đó chỉ rõ module path vượt gốc; đọc source Miniflare xác nhận modulesRoot mặc định là cwd, trong khi bundle QA nằm ngoài repo. Sửa gốc về thư mục bundle, không đổi cấu hình/build Lovable: bundle mới chạy native Windows đầy đủ đạt 4 nhóm kiểm (JWT sai/hết hạn, RS256 hợp lệ, chữ ký sửa, SSR không lộ identity); 1 JWKS local, 0 outbound bất ngờ. Linux CI với harness sửa cũng đạt 4 nhóm ở các lượt quality sau bản sửa; không deploy hoặc dùng tài khoản thật.

## Checklist riêng tư (PLAN.md §10)

Bảng kiểm từ roadmap §10. "Tự động" là test hoặc bước CI đang chạy ở mỗi PR; phần còn lại ghi rõ ai làm.

| #   | Mục                                                                                              | Kiểm tự động trong repo                                                                                                                                                                                  | Còn lại, ai làm                                                                                                                                            | Kiểu                |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1   | Repo private; không toạ độ, địa chỉ, số nhà, key trong repo, `.env`, Notion, chat                | Gitleaks toàn lịch sử ở job quality (`bun run check:secrets`); test và CI chỉ dùng fixture tổng hợp                                                                                                      | Repo đang public theo chủ dự án (CODEX_HANDOFF §1), đổi visibility chỉ chủ dự án làm; mỗi PR quét diff riêng tư (cổng §5.2); Notion, chat do chủ dự án giữ | Tự động + chủ dự án |
| 2   | Bản Lovable chỉ chạy demo; `robots.txt` chặn, có `noindex`; ẩn badge nếu gói cho phép            | `private-access.test.ts` (bản public luôn demo dù có binding riêng); e2e `demo.spec.ts`, `h6-completion.spec.ts` (noindex, phố hư cấu); `private-checklist.test.ts` (`Disallow: /`)                      | Ẩn badge Lovable tuỳ gói (chủ dự án)                                                                                                                       | Tự động + chủ dự án |
| 3   | Bản riêng tư sau Cloudflare Access; server kiểm JWT Access trước khi trả cấu hình riêng          | `private-access.test.ts` (chữ ký, issuer, audience, hạn, nbf, xoay khoá, lỗi không lộ dữ liệu); job quality chạy dry run và Workerd native; `private-checklist.test.ts` (workers.dev, preview URL tắt)   | Tạo Access application, policy chỉ email người nhà, kiểm sau deploy (chủ dự án)                                                                            | Tự động + chủ dự án |
| 4   | Key Google chỉ khi nhúng 3D Tiles: tách dev/prod, giới hạn referrer và API, quota, budget        | Không có key Google; Phố thật chỉ mở link; e2e `p7-real-street.spec.ts` không liên hệ Google thật; e2e `accessibility.spec.ts` (0 host ngoài ở ba viewport)                                              | Chỉ cần khi quyết định nhúng 3D Tiles (NOT_STARTED)                                                                                                        | Không áp dụng       |
| 5   | AI không giữ token Google, Cloudflare, R2; chủ dự án tự upload, publish, đổi cấu hình            | `private-checklist.test.ts`: `deploy:private` từ chối `--deploy` khi có `CI`, từ chối tham số lạ                                                                                                         | Codex không đăng nhập, không deploy (CODEX_HANDOFF §5.4); chủ dự án giữ mọi credential                                                                     | Tự động + quy trình |
| 6   | Ảnh xuất ra đã xoá EXIF/GPS (có test tự động)                                                    | `p10-media.test.ts` (từ chối JPEG APP1 Exif/GPS, APP13, WebP EXIF/XMP); e2e `p10-memories.spec.ts` (pipeline ảnh xoá EXIF Orientation/GPS/XMP)                                                           | —                                                                                                                                                          | Tự động             |
| 7   | Làm mờ mặt người, biển số, số nhà hàng xóm                                                       | Không có (ML làm mờ là NOT_DONE có chủ ý, CODEX_HANDOFF §4)                                                                                                                                              | Chủ dự án soát tay từng ảnh trước khi nhập                                                                                                                 | Chủ dự án           |
| 8   | Không công bố mặt bằng nội thất, vị trí camera an ninh, két                                      | App không có kiểu dữ liệu nội thất; bản khách và xuất công khai bỏ kỷ niệm riêng, nhật ký, ảnh chưa duyệt (`p10-session-camera.test.ts`, e2e `p10-memories.spec.ts`)                                     | Chủ dự án không đưa nội dung này vào kỷ niệm, ảnh hay ghi chú                                                                                              | Tự động + chủ dự án |
| 9   | Bản public không nhãn "Nhà mình", ghim lô, nhật ký xây nhà, kỷ niệm riêng; cân nhắc tắt Phố thật | Bản public chỉ có phố hư cấu (hàng 2); e2e `p10-memories.spec.ts` (chế độ khách ẩn kỷ niệm riêng, nhãn nhà, marker/lô, nhật ký); `p7-control.test.tsx` (Phố thật tắt ở demo và gói thiếu companion khớp) | —                                                                                                                                                          | Tự động             |
| 10  | Không cache hay lưu nội dung Google ở bất kỳ đâu                                                 | E2e production `pwa.spec.ts` (cache offline chỉ có byte tĩnh của mình); `p7-real-street.spec.ts` (popup tổng hợp, không referrer); e2e `accessibility.spec.ts` (0 host ngoài)                            | —                                                                                                                                                          | Tự động             |
