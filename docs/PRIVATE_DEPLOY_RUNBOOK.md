# Bản riêng tư trên Workers + Access

`PARTIAL — NOT_DEPLOYED`: tài liệu và mã đang chuẩn bị. Chưa kiểm xong runtime, CLI và bundle; chưa được coi là `READY_TO_DEPLOY_NOT_DEPLOYED`. Codex không đăng nhập hay deploy. Chỉ chủ dự án thực hiện các bước dịch vụ sau audit.

## Phạm vi v1

Cùng bundle ứng dụng chạy ở cả Lovable và Workers riêng. Lovable luôn trả runtime `demo`. Entry riêng bọc Worker đã build và xác minh Access tại `/api/private-runtime`; response hợp lệ chỉ có `mode: private` và `packageSource: local-file`. Không trả JWT, email, vị trí, world hoặc companion. Gói và tham chiếu G1 vẫn do người xem chọn từ máy; các kiểm tra binding và consent hiện có giữ nguyên.

Private entry, cấu hình và lệnh nằm ở `private/entry.ts`, `wrangler.private.jsonc`, `scripts/private-deploy.mjs`. Cấu hình này không thay build Lovable. `workers_dev` và preview URL tắt; không có route/domain/tài khoản thật trong repo. `nodejs_compat` phục vụ bundle Nitro hiện hữu. Compatibility date của config riêng phải được kiểm bằng runtime cục bộ trước khi chốt audit.

## Kiểm cục bộ trước khi bàn giao

1. Dùng Bun 1.4.3; chạy frozen install, check, test liên quan và build theo cổng chung. Không nới guard tuổi dependency.
2. Dùng Wrangler CLI đã kiểm trong toolchain riêng của Home 3D. Không thêm native/postinstall dependency vào build Lovable. Gán biến tiến trình `HOME3D_WRANGLER_CLI` tới entry JavaScript của CLI đó.
3. `bun run deploy:private` mặc định dry run, chưa yêu cầu upload. Chỉ chạy khi đã kiểm đường đi của CLI không cần tài khoản cho dry run. Không chạy `--deploy` trong QA của Codex.
4. Chạy Worker cục bộ bằng cấu hình riêng với binding tổng hợp; kiểm thiếu/sai JWT chỉ trả demo, response `no-store`, app vẫn mở được. Unit dùng khoá ký sinh tạm, JWKS mock, kiểm signature/issuer/audience/expiry/nbf/rotation/error và không lộ dữ liệu. Không nạp secret thật để test.
5. Kiểm client bundle không chứa verifier/secret và không thêm host mạng của trình duyệt. Service Worker không cache endpoint runtime, API hay file riêng. Lưu kết quả thật vào CODEX_LOG/AUDIT_PACKET.

Toolchain QA đã kiểm: Wrangler 4.151.3, Workerd 1.20261019.1, Miniflare 5.20261019.1-beta, Node 22.22.0 trên Windows. Dry run và Worker native đầy đủ đã đạt bằng JWT/key sinh tạm, JWKS local và ASSETS file-backed. Linux CI còn pending. Đây không phải xác nhận policy Access hay host thật.

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

R2 private là v2 `NOT_DONE`, không cần cho v1 chọn file. Nếu làm sau này: bucket riêng, chỉ đọc qua Worker đã kiểm Access; đánh giá lại cache, quyền và logging trước khi sử dụng. Analytics mặc định tắt. Không có migration/database trong v1.

Chủ dự án dùng cơ chế rollback phiên bản của Cloudflare để quay về bản đã kiểm, rồi lặp lại kiểm Access và endpoint. Không force-push hoặc viết lại Git. Nếu cần build lại phiên bản cũ, dùng tag/commit trong checkout riêng. Tag `baseline/p10-published` và lịch sử Lovable là hai điểm khôi phục của bản công khai; Publish Lovable vẫn là thao tác riêng của chủ dự án sau audit.

## Giới hạn runtime đang điều tra

Ba lỗi startup Windows lịch sử được giữ trong evidence. Linux CI sau đó chỉ rõ module path vượt gốc; đọc source Miniflare xác nhận modulesRoot mặc định là cwd, trong khi bundle QA nằm ngoài repo. Sửa gốc về thư mục bundle, không đổi cấu hình/build Lovable: bundle mới chạy native Windows đầy đủ đạt 4 nhóm kiểm (JWT sai/hết hạn, RS256 hợp lệ, chữ ký sửa, SSR không lộ identity); 1 JWKS local, 0 outbound bất ngờ. Linux với harness sửa vẫn pending; không deploy hoặc dùng tài khoản thật.
