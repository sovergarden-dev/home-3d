# M2 — bằng chứng tổng hợp

Source runtime sau sửa: `487156d0a8a266161f8c00ad1096d5efed081429`; trước: `0b56c490b2b04b56294d6742645559b0e459f7b5` (M1 tích hợp vào nhánh M2 trước tối ưu audio/đọc tác nhân). Chỉ fixture tổng hợp. Chưa merge, chưa có CI head cuối.

- `qualification.json`: kết quả và SHA-256 của raw đầu vào; check Windows 378 unit / 39 pipeline, lint 0, vỏ 222.305 byte gzip tại source 6cce959 (sau sửa mobile từ review). Ratchet coverage giữ nguyên mức đã đo, mục tiêu 85% chưa đạt ở mọi chỉ số state/simulation.
- `p8-before`, `p8-after`: 30 vòng × 14 thao tác UI; sau sửa 420 thao tác đều <100 ms, max 78,4 ms, không shader link mới. Sparse drag trong harness này có khoảng chờ do điều khiển qua driver; raw và nhãn NOT_MET gốc được giữ, không dùng làm phép đo FPS/xoay liên tục.
- `p8-continuous-after`: 240 bước pointer theo RAF trình duyệt ở nắng/ngày, bão/đêm và ngập/lễ hội; 717 khoảng render, không thiếu bước, max 44,5 ms. Là cadence submit CPU, không thời gian thực thi GPU hoặc timestamp hiển thị vật lý. Script hash hiện tại khớp raw.
- `p9-before`, `p9-after`: mỗi thao tác 30 mẫu. Sau: cold-context p50 77,10 / p95 92,10 / max 124,20 ms; warm p50 61,55 / p95 76,80 / max 108 ms. Giữ NOT_MET cho mọi mẫu <100. Cold là AudioContext mới trên trang mới trong một browser process; không phải 30 lần khởi động browser mới. Mute đầu ra, không đo mẫu âm thanh nghe được đầu tiên.
- `audio-profile`: diagnostic có CPU profiler, không dùng làm số nghiệm thu. Trước sửa AudioContext thật running nhưng dataset vẫn suspended trong cảnh dừng; timeout warm không chứng minh tiếng thực bị chậm 5 giây.
- `p8-diagnostic`, `p9-after-diagnostic`: chỉ một vòng kiểm harness, không đủ mẫu nghiệm thu; không lọc khỏi lịch sử.
- `visual-before`, `visual-after`: GPU thật; Diorama và 740×390 các POV. Đã xem ảnh sau: tác nhân lớn hơn, nhóm điều khiển không đè HUD/panel local.
- `initial-layout-check.json`: giữ hai lượt lỗi harness/layout và kết quả bốn ca cuối đã đạt. Playwright Test cần contextOptions hoặc emulateMedia, không dùng trường reducedMotion trực tiếp. H6 giữ no-preference như điều kiện thực tế cũ.
- `dependency-review.json`, `line-endings.json`: kiểm tarball/tuổi/giấy phép và tám JSON M0 chỉ đổi CRLF sang LF, giá trị JSON bằng nhau.

H6 GPU thật đối chiếu mới: de71732 43.434 ms → 6cce959 41.839 ms (−3,67%), cùng harness/DPR1/no-preference; raw JSON đã khử đường dẫn/loopback, metadata GPU giữ nguyên. CI Linux và gate H6 hiện hành vẫn phải đạt; skip không là pass. Kết quả Chromium/Firefox liên quan đã đạt 22/22; WebKit lượt đầu 7 pass/3 fail; hai lỗi focus đã sửa và ba ca layout cuối WebKit đạt. Ca audio còn NOT_VERIFIED_UNSUPPORTED: cả AudioContext và OfflineAudioContext đều không có trong WebKit Windows, gồm tên prefixed. Không đổi assertion/skip guard cũ. Gitleaks source/evidence và kiểm path/token/size đã đạt. Reviewer độc lập đóng hai P2 và một P3; không còn actionable finding tại ff550657. PR/CI head cuối còn phải chốt.

- `h6-webkit-linux-2026-10-31`: chẩn đoán H6 WebKit trên Linux không GPU lúc Notion AI tạm tiếp quản; ABBA bỏ backdrop blur −33,4% vòng chẩn đoán. Không phải kết quả CI.
