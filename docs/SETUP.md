# Hướng dẫn cài đặt MeetMind và đăng ký dịch vụ Google

Tài liệu này đi từ máy trống đến hệ thống chạy với Google Meet thật, theo đúng trạng thái hiện tại của dự án. Lệnh và tên biến lấy từ `Makefile`, `.env.example` và `README.md`.

**Trạng thái đã kiểm chứng**

| Phần | Tình trạng |
|---|---|
| Chạy demo (bot giả lập), tài liệu, dịch, biên bản, tổ chức, lời mời | Đã chạy và có test |
| Đăng nhập Google | Mã đã viết và test bằng bộ kiểm tra giả lập. Chưa đăng nhập được thật cho tới khi thêm JavaScript origin (mục 3.3) |
| Tạo phòng Meet từ MeetMind | Mã đã viết. Cần bật API, scope, test user và redirect URI (mục 3.2 đến 3.4) |
| Bot vào Meet thật | Bot đã gọi được nhưng Google từng chặn khách ẩn danh ("You can't join this video call"). Xem mục 5 |

---

## 1. Yêu cầu trên máy

- Linux, Docker và Docker Compose. Backend chạy `network_mode: host` nên chỉ dùng được trên Linux.
- Ollama. `make up` tự khởi động và tải mô hình `qwen2.5:3b`. Máy thử nghiệm có GPU 4 GB.
- MinIO đã chạy trên máy, tài khoản có quyền đọc, ghi, xóa và tạo bucket.
- PostgreSQL đã chạy trên máy (chạy thử demo thì không cần, dùng SQLite).
- Python 3.12 trở lên và Node.js, nếu chạy trực tiếp không qua Docker.
- LibreOffice (`soffice`), nếu muốn mở tài liệu Word hoặc PowerPoint. PDF thì không cần.

## 2. Chạy thử không cần Google

Cách nhanh nhất để thấy hệ thống: bot được giả lập bằng một cuộc họp mẫu.

```bash
make setup      # tạo .env với khóa ngẫu nhiên, tạo config nếu chưa có
make up-demo    # Ollama + backend + giao diện, bot giả lập, không dựng Attendee
```

Mở http://localhost:3000. Đăng nhập bằng email bất kỳ (mã 6 số hiện ngay trên màn hình đăng nhập), tạo tổ chức, tạo phiên họp với link dạng `https://meet.google.com/abc-defg-hij`, rồi bấm **Gọi bot vào họp**. Ở chế độ demo, link chỉ để điền cho đủ.

Chạy trực tiếp không qua Docker:

```bash
cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -e '.[dev]'
uvicorn app.main:create_app --factory --port 8000 --loop asyncio
cd frontend && npm install && npm run dev      # http://localhost:3000
```

Luôn thêm `--loop asyncio`: `uvloop` làm treo LibreOffice trên Python 3.14.

## 3. Đăng ký dịch vụ Google

Tất cả làm trong một dự án Google Cloud duy nhất. Dùng lại dự án có sẵn cũng được, miễn là tạo hoặc sửa một **OAuth client kiểu Web application**.

### 3.1 Tạo dự án và OAuth client

1. Vào https://console.cloud.google.com, chọn hoặc tạo dự án.
2. **APIs & Services → OAuth consent screen**:
   - Loại người dùng: **External** (chọn Internal sẽ báo lỗi `org_internal` với tài khoản ngoài tổ chức).
   - Trạng thái **Testing** giới hạn 100 test user. Chỉ người trong danh sách mới đăng nhập hoặc tạo phòng Meet được.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**. Ghi lại:
   - **Client ID**: mã công khai, đặt vào `GOOGLE_CLIENT_ID`.
   - **Client secret**: bí mật, đặt vào `GOOGLE_CLIENT_SECRET`, không chia sẻ hay commit.

### 3.2 Bật Google Meet REST API

**APIs & Services → Library → Google Meet REST API → Enable.** Cần cho nút **Tạo phòng Meet**.

### 3.3 Cấu hình client

Mở client vừa tạo:

| Mục | Giá trị | Dùng cho |
|---|---|---|
| Authorized JavaScript origins | `http://localhost:3000` (thêm tên miền thật khi triển khai) | Nút đăng nhập Google |
| Authorized redirect URIs | `http://localhost:8000/api/google/callback` (đổi theo `PUBLIC_API_URL`) | Tạo phòng Meet |

Thiếu origin thì Google báo `The given origin is not allowed`. Thiếu redirect URI thì báo `redirect_uri_mismatch`. Thay đổi có thể mất vài phút mới có hiệu lực.

### 3.4 Scope và test user

1. Trong **OAuth consent screen → Data access (Scopes)**, thêm scope `https://www.googleapis.com/auth/meetings.space.created`. Scope này chỉ cho phép ứng dụng thấy các phòng do chính nó tạo.
2. Trong **Audience (Test users)**, thêm email của từng người sẽ đăng nhập hoặc tạo phòng khi ứng dụng còn ở chế độ Testing.
3. Muốn mọi người dùng được mà không cần thêm từng email thì phải đưa ứng dụng lên **In production**, và scope nhạy cảm có thể phải qua xác minh của Google. Việc này chưa làm.

### 3.5 Khai báo trong MeetMind

Đặt trong `.env` (và `backend/.env` khi chạy trực tiếp):

```env
GOOGLE_CLIENT_ID=<client id của bạn>
GOOGLE_CLIENT_SECRET=<client secret của bạn>
PUBLIC_API_URL=http://localhost:8000
GOOGLE_ALLOWED_DOMAINS=[]        # ["congty.com"] để chỉ cho một tên miền
EMAIL_CODE=on                    # auto | on | off, xem ghi chú bên dưới
```

Khi Google đăng nhập đã chạy được, đặt `EMAIL_CODE=off`. Giữ `on` với email giả lập (`console`) thì mã hiện ngay trên màn hình và ai cũng đăng nhập được bằng email bất kỳ. Rồi chạy `make restart`.

Cách hoạt động của việc tạo phòng: người dùng đồng ý với Google một lần, hệ thống lấy mã, tạo phòng ngay, lưu link vào phiên họp và bỏ token (không lưu refresh token). Phòng tạo ở chế độ `OPEN`, ai có link cũng vào được, để bot khỏi chờ ai bấm Cho phép.

## 4. Chạy với bot thật (Attendee)

```bash
make setup                 # lần đầu, rồi điền .env: khóa MinIO, DATABASE_URL
make db-help               # in lệnh tạo người dùng và CSDL PostgreSQL
make up                    # dựng tất cả
```

`make up` lần lượt: bảo đảm Ollama và mô hình, tải Attendee đúng phiên bản đã ghim vào `./attendee-src`, tạo cấu hình, build (khoảng 5 phút lần đầu), chạy ở cổng 8010, tạo API key và ghi vào `.env`, rồi dựng backend và giao diện.

Lệnh hay dùng: `make status` (từng dịch vụ có sống không), `make logs`, `make restart` (sau khi sửa `.env` hay config), `make attendee-rekey` (khi báo 401), `make down`, `make use-demo` / `make use-attendee` để đổi bot.

Dùng thử:

1. Trong MeetMind tạo phiên họp, bấm **Tạo phòng Meet** (hoặc dán link phòng có sẵn).
2. Vào phòng Meet bằng trình duyệt.
3. Bấm **Gọi bot vào họp**, và **Admit** bot nếu nó đứng ở phòng chờ.

Cần biết:

- Phụ đề Meet theo **một ngôn ngữ cho cả cuộc họp** (`MEET_CAPTION_LANG`, mặc định `vi-VN`). Người nói ngôn ngữ khác sẽ bị nhận sai.
- Bot là khách bên ngoài, mỗi bot mở một trình duyệt Chrome nên khá nặng.
- Sau mỗi lần khởi động lại, backend tự đóng các cuộc họp bị gián đoạn và gỡ bot mồ côi.

## 5. Khi bot không vào được Meet

Triệu chứng đã gặp: bot vào rồi ra liên tục, trong log Attendee có lỗi kiểu "You can't join this video call". Nguyên nhân là Google chặn khách ẩn danh. Cách kiểm tra:

```bash
make attendee-logs          # xem lý do Google trả về
```

Các hướng xử lý, từ dễ đến khó:

1. Tạo phòng bằng chính nút **Tạo phòng Meet** của MeetMind (chế độ `OPEN`), thay vì phòng tạo tay hoặc phòng chỉ cho người trong tổ chức.
2. Kiểm tra phòng không đặt chế độ "chỉ người trong tổ chức" và không bắt xác minh thêm.
3. Nếu Google vẫn chặn, bot ẩn danh không dùng được. Hướng thay thế (Meet Add-ons SDK, Meet Media API) mới là ý định, chưa làm.

## 6. Lỗi thường gặp

| Thông báo | Nguyên nhân | Cách sửa |
|---|---|---|
| `The given origin is not allowed` | Thiếu JavaScript origin | Mục 3.3 |
| `redirect_uri_mismatch` | Thiếu hoặc sai redirect URI | Mục 3.3, khớp đúng `PUBLIC_API_URL` |
| `org_internal` | Màn hình đồng ý đặt Internal | Chuyển sang External |
| `access_denied` khi tạo phòng | Email chưa vào Test users hoặc thiếu scope | Mục 3.4 |
| Báo 401 khi gọi bot | API key Attendee mất | `make attendee-rekey` |
| Word/PowerPoint không mở | Thiếu LibreOffice | Cài `soffice` |
| Giao diện cũ sau khi sửa code | Docker dùng bản đã build | `make up` để build lại |

## 7. Việc còn lại

- Thử với một cuộc họp Google Meet thật từ đầu đến cuối (đăng nhập thật, tạo phòng, bot vào, phụ đề chạy).
- Quyết định đưa ứng dụng Google lên In production hay giữ Testing.
- Đánh giá Meet Add-ons SDK nếu bot tiếp tục bị chặn.
