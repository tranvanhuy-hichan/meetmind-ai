# Hướng dẫn cài đặt MeetMind (Google Meet và Zoom)

Tài liệu đi từ máy trống đến hệ thống chạy với Google Meet và Zoom thật, kể cả cách đăng ký và lấy từng khóa. Lệnh và tên biến lấy từ `Makefile`, `.env.example`, `docker-compose.yml`.

**Trạng thái đã kiểm chứng**

| Phần | Tình trạng |
|---|---|
| Chạy demo (bot giả lập), tài liệu, dịch, biên bản, tổ chức, lời mời | Đã chạy và có test |
| Chọn Meet hoặc Zoom khi tạo phiên | Đã chạy thật, có test |
| Tạo cuộc họp Zoom từ MeetMind (OAuth) | Đã chạy thật qua tên miền Cloudflare |
| Bot Attendee vào họp Zoom, **video Zoom nhúng trong phòng** | Đã chạy thật |
| Phụ đề từ Zoom (bot đọc caption) | **Chưa xác nhận** có chữ về đủ và đúng người nói |
| Chia sẻ màn hình trong Zoom nhúng | **Chưa xong**: bị chặn nếu cuộc họp để "chỉ host chia sẻ" (mục 7) |
| Đăng nhập Google, tạo phòng Meet | Mã đã viết và test giả lập; cần cấu hình đúng origin và redirect URI (mục 3) |
| Họp Meet thật từ đầu đến cuối | Google từng chặn khách ẩn danh ("You can't join this video call") |
| Họp của tài khoản Zoom khác | Cần Zoom duyệt app và token OBF. Chưa thử |

---

## 1. Yêu cầu trên máy

- Linux, Docker và Docker Compose. Backend chạy `network_mode: host` nên chỉ dùng được trên Linux.
- Ollama. `make up` tự khởi động và tải mô hình `qwen2.5:3b` (máy thử nghiệm có GPU 4 GB).
- MinIO đã chạy trên máy, tài khoản có quyền đọc, ghi, xóa và tạo bucket.
- PostgreSQL đã chạy trên máy (chạy thử demo thì không cần, dùng SQLite).
- Python 3.12 trở lên và Node.js, nếu chạy trực tiếp không qua Docker.
- LibreOffice (`soffice`) nếu muốn mở Word hoặc PowerPoint. PDF thì không cần.
- Một **tên miền quản lý bằng Cloudflare** nếu muốn dùng Zoom (mục 5). Zoom không nhận callback `http://localhost`.

## 2. Chạy thử không cần Google hay Zoom

```bash
make setup      # tạo .env với khóa ngẫu nhiên, tạo config nếu chưa có
make up-demo    # Ollama + backend + giao diện, bot giả lập
```

Mở http://localhost:3000. Đăng nhập bằng email bất kỳ (mã 6 số hiện ngay trên màn hình đăng nhập), tạo tổ chức, tạo phiên họp (chọn Meet hoặc Zoom, link chỉ để điền cho đủ), bấm **Gọi bot vào họp**.

Chạy trực tiếp không qua Docker:

```bash
cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -e '.[dev]'
uvicorn app.main:create_app --factory --port 8000 --loop asyncio
cd frontend && npm install && npm run dev      # http://localhost:3000
```

Luôn thêm `--loop asyncio`: `uvloop` làm treo LibreOffice trên Python 3.14. Khi chạy trực tiếp, biến môi trường của backend có tiền tố `MEETMIND_` (xem `backend/.env.example`), ví dụ `MEETMIND_ZOOM_CLIENT_ID`.

## 3. Đăng ký dịch vụ Google

Tất cả làm trong một dự án Google Cloud. Dùng lại dự án có sẵn cũng được, miễn là tạo hoặc sửa một **OAuth client kiểu Web application**.

### 3.1 Tạo dự án và OAuth client

1. Vào https://console.cloud.google.com, chọn hoặc tạo dự án.
2. **APIs & Services → OAuth consent screen**: loại người dùng **External** (Internal sẽ báo `org_internal` với tài khoản ngoài tổ chức). Trạng thái **Testing** chỉ cho tối đa 100 test user đăng nhập.
3. **Credentials → Create credentials → OAuth client ID → Web application**. Ghi lại **Client ID** (công khai, vào `GOOGLE_CLIENT_ID`) và **Client secret** (bí mật, vào `GOOGLE_CLIENT_SECRET`). Google không cho xem lại secret cũ; mất thì thêm secret mới.

### 3.2 Bật Google Meet REST API

**APIs & Services → Library → Google Meet REST API → Enable.** Cần cho nút **Tạo phòng Meet**.

### 3.3 Cấu hình client

Địa chỉ phải khớp **từng ký tự** với `PUBLIC_API_URL` (API) và địa chỉ bạn mở giao diện (web):

| Mục | Giá trị mặc định (chạy trên máy) | Giá trị khi dùng tên miền công khai | Dùng cho |
|---|---|---|---|
| Authorized JavaScript origins | `http://localhost:3000` | `https://meetmind.tenmiencuaban.com` | Nút đăng nhập Google |
| Authorized redirect URIs | `http://localhost:8000/api/google/callback` | `https://apimeetmind.tenmiencuaban.com/api/google/callback` | Tạo phòng Meet |

Thiếu origin thì `The given origin is not allowed`; thiếu redirect URI thì `redirect_uri_mismatch`. Thay đổi mất vài phút đến vài giờ mới có hiệu lực. Có thể khai nhiều địa chỉ cùng lúc.

### 3.4 Scope và test user

1. **OAuth consent screen → Data access (Scopes)**: thêm `https://www.googleapis.com/auth/meetings.space.created` (chỉ thấy phòng do chính ứng dụng tạo).
2. **Audience (Test users)**: thêm email từng người sẽ đăng nhập hoặc tạo phòng khi ứng dụng còn ở chế độ Testing (từng bước ở mục 12).
3. Muốn mọi người dùng được mà không cần thêm từng email thì phải đưa ứng dụng lên **In production**; scope nhạy cảm có thể phải qua xác minh của Google. Chưa làm.

### 3.5 Khai báo trong MeetMind

Trong `.env` (và `backend/.env` khi chạy trực tiếp):

```env
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
PUBLIC_API_URL=http://localhost:8000
GOOGLE_ALLOWED_DOMAINS=[]        # ["congty.com"] để chỉ cho một tên miền
EMAIL_CODE=off                   # auto | on | off, xem mục 8
```

Rồi `make restart`.

## 4. Đăng ký dịch vụ Zoom (chi tiết)

Zoom dùng **một app duy nhất** cho cả ba việc: (a) tạo cuộc họp từ MeetMind (OAuth), (b) nhúng video vào phòng họp (Meeting SDK), (c) cho bot Attendee vào họp. Vì vậy chỉ có **một cặp Client ID và Client Secret**, nhưng nó phải được khai ở ba nơi (xem bảng mục 6).

### 4.1 Chuẩn bị tài khoản

1. Cần một tài khoản Zoom (https://zoom.us). Nên dùng chính tài khoản sẽ tạo và chủ trì các cuộc họp: app chưa được Zoom duyệt chỉ dùng được với họp của **tài khoản tạo ra app**.
2. Vào cổng developer: https://marketplace.zoom.us, ở thanh bên trái dưới cùng bấm **Developers – Build on Zoom's platform** (hoặc mở thẳng https://marketplace.zoom.us/user/build). Trang "Created apps" hiện ra. Nếu không thấy mục này, tài khoản bị tổ chức khóa quyền tạo app: dùng tài khoản khác hoặc nhờ admin.

### 4.2 Tạo app

1. Bấm dấu **+** cạnh chữ **Developer**, chọn **General app**.
2. Chọn loại **User-managed**, đặt tên (ví dụ "MeetMind"), tạo.
3. Mở mục **Basic information**: trang này chứa mọi thứ cần lấy (4.3 đến 4.5). Zoom có hai chế độ **Development** và **Production**; làm ở tab **Development**.

### 4.3 Lấy Client ID và Client Secret

Cũng ở **Basic information → App credentials**:

- **Client ID**: chuỗi ngắn, không bí mật. Điền vào `ZOOM_CLIENT_ID`.
- **Client secret**: bấm **Show** để xem, hoặc **Regenerate** để tạo mới. **Bí mật**: không dán vào chat, email hay commit vào git. Nếu lộ, bấm **Regenerate** ngay và nạp lại ở mọi nơi dùng (mục 6).

### 4.4 Khai redirect URL (phải là https)

Cũng ở **Basic information → OAuth information**:

- **OAuth redirect URL**: `https://apimeetmind.tenmiencuaban.com/api/zoom/callback` (hostname là của bạn, xem mục 5).
- **OAuth allow lists**: **Add allow list**, điền đúng URL trên.
- Bấm **Continue** ở cuối trang để lưu.

Điểm dễ sai (đã gặp): Zoom **không nhận `http://localhost`** (ô nhập từ chối) và với `http://127.0.0.1` thì khi xin quyền Zoom báo `Invalid redirect URL`. Chỉ địa chỉ `https://` (qua Cloudflare Tunnel, mục 5) chạy ổn. Địa chỉ phải khớp từng ký tự với `ZOOM_REDIRECT_URI` trong `.env`, không có dấu `/` thừa ở cuối.

### 4.5 Bật Meeting SDK và thêm scope

- **Features → Embed**: bật **Meeting SDK**. Không bật thì video nhúng báo lỗi chữ ký hoặc không cho vào.
- **Scopes**: thêm scope tạo cuộc họp, tên là `meeting:write:meeting` (hoặc mục tương đương "Create a meeting for a user" trong nhóm Meeting, tên có thể khác tùy giao diện Zoom). Thiếu scope thì tạo phòng báo "Zoom không cho tạo cuộc họp".
- Nếu Zoom báo lỗi về tên miền khi nhúng, thêm tên miền giao diện của bạn (ví dụ `meetmind.tenmiencuaban.com`) vào danh sách tên miền được phép của app, nếu app có mục đó.

### 4.6 Khai trong MeetMind

Trong `.env`:

```env
ZOOM_CLIENT_ID=<Client ID>
ZOOM_CLIENT_SECRET=<Client secret>
ZOOM_REDIRECT_URI=https://apimeetmind.tenmiencuaban.com/api/zoom/callback
```

Rồi `docker compose up -d backend`. Kiểm tra: `curl localhost:8000/api/config` phải có `"zoom_rooms":true`.

### 4.7 Cho bot Attendee biết khóa Zoom

Bot Attendee cần chính cặp khóa này để vào họp Zoom. Cách nhanh nhất:

```bash
make attendee-zoom
```

Lệnh đọc `ZOOM_CLIENT_ID` và `ZOOM_CLIENT_SECRET` trong `.env` và nạp vào project của MeetMind trong Attendee (không in secret ra màn hình). **Chạy lại sau mỗi lần đổi secret.** Cách khác là nhập tay trong giao diện Attendee (http://localhost:8010, mục Settings → Credentials).

Phụ đề Zoom lấy từ caption có sẵn của Zoom (SDK web), nên **không cần Deepgram**. Ngôn ngữ phụ đề đặt bằng `ZOOM_CAPTION_LANG` (mặc định `Vietnamese`). Muốn dùng Deepgram thì khai `bot.zoom.transcription_settings` trong `config.yaml` (mẫu ở `config.example.yaml`) và nhập Deepgram key vào Attendee.

### 4.8 Cài đặt tài khoản Zoom nên bật

Vào https://zoom.us/profile/setting, mục **In Meeting (Basic)**:

- **Screen sharing → Who can share? → All Participants** (xem mục 7 về chia sẻ màn hình).
- Cho phép phụ đề (**Closed captioning**) để bot đọc được caption.

## 5. Tên miền công khai bằng Cloudflare Tunnel

Cần khi dùng Zoom (callback phải `https://`). Tunnel nối một hostname công khai về `localhost` của máy, không cần mở cổng router.

### 5.1 Tạo tunnel

1. https://one.dash.cloudflare.com → **Networks → Tunnels → Create a tunnel** → loại **Cloudflared** → đặt tên (ví dụ `meetmind`).
2. Chọn **Docker**. Ô lệnh có đoạn `--token eyJ...`: chuỗi dài bắt đầu bằng `eyJ` là **token**. Đây **không phải Tunnel ID** (dạng UUID có gạch ngang). Token cho phép chạy tunnel dưới tài khoản của bạn, giữ bí mật.
3. Điền token vào `.env`: `CLOUDFLARE_TUNNEL_TOKEN=eyJ...`, rồi chạy:
   ```bash
   docker compose --profile tunnel up -d cloudflared
   ```
   Chạy bằng compose (mạng host) chứ không `docker run` thường: container ở mạng Docker thường sẽ không thấy `localhost:8000` của máy. Cloudflare báo tunnel **Healthy** là nối được. Nút Continue của Cloudflare chỉ sáng sau khi tunnel đã nối.
4. Khi nghi lộ token: trang tunnel → **Rotate token**, rồi cập nhật `.env` và chạy lại `docker compose --profile tunnel up -d --force-recreate cloudflared`.

### 5.2 Tạo route (Routes → Add route → Published application)

Hai phương án:

**A. Chỉ mở callback của Zoom (ít rủi ro nhất; dùng khi vẫn mở MeetMind qua `http://localhost:3000`)**

| Hostname | Path | Service |
|---|---|---|
| `apimeetmind.tenmiencuaban.com` | `api/zoom/callback` | `http://localhost:8000` |

Path này là lớp bảo vệ: các đường dẫn khác của API (`/api/health`, đăng nhập...) bị chặn (404) qua tunnel. Trong `.env` chỉ cần `ZOOM_REDIRECT_URI`; `PUBLIC_API_URL` giữ `http://localhost:8000`. Sau khi Zoom xong, trình duyệt quay về `localhost:3000`.

**B. Mở cả giao diện và API (dùng MeetMind hoàn toàn qua tên miền)**

| Hostname | Path | Service |
|---|---|---|
| `meetmind.tenmiencuaban.com` | (để trống) | `http://localhost:3000` |
| `apimeetmind.tenmiencuaban.com` | (để trống) | `http://localhost:8000` |

Đặt trong `.env` rồi **dựng lại cả frontend** (địa chỉ API gắn cứng lúc build):

```env
PUBLIC_API_URL=https://apimeetmind.tenmiencuaban.com
PUBLIC_API_BASE=https://apimeetmind.tenmiencuaban.com
MEETMIND_APP_URL=https://meetmind.tenmiencuaban.com
CORS_ORIGINS=["https://meetmind.tenmiencuaban.com","http://localhost:3000"]
ZOOM_REDIRECT_URI=https://apimeetmind.tenmiencuaban.com/api/zoom/callback
EMAIL_CODE=off
```

```bash
docker compose up -d --build backend frontend
```

Với phương án B, cập nhật Google (mục 3.3) sang hai hostname này, và **đọc kỹ mục 8 (bảo mật)** trước khi mở. Khi giao diện đi qua tunnel, tắt `cloudflared` thì giao diện cũng không gọi được API.

## 6. Bảng khóa: lấy ở đâu, điền vào đâu

| Khóa | Lấy ở | Điền vào | Bí mật? |
|---|---|---|---|
| Google Client ID | Google Cloud → Credentials | `GOOGLE_CLIENT_ID` (`.env`) | Không |
| Google Client secret | Google Cloud → Credentials (thêm secret mới nếu mất) | `GOOGLE_CLIENT_SECRET` (`.env`) | **Có** |
| Zoom Client ID | Zoom Marketplace → app → Basic information | `ZOOM_CLIENT_ID` (`.env`) | Không |
| Zoom Client secret | Cùng trang (Show hoặc Regenerate) | `ZOOM_CLIENT_SECRET` (`.env`) **và** Attendee (`make attendee-zoom`) | **Có** |
| Zoom redirect URL | Tự đặt theo hostname Cloudflare | `ZOOM_REDIRECT_URI` (`.env`) **và** app Zoom (OAuth redirect URL + allow list) | Không |
| Cloudflare tunnel token | Cloudflare → Tunnels → lệnh Docker (`--token`) | `CLOUDFLARE_TUNNEL_TOKEN` (`.env`) | **Có** |
| Attendee API key | `make up` tự tạo | `ATTENDEE_API_KEY` (`.env`, tự ghi) | **Có** |
| MinIO, PostgreSQL | Của máy bạn | `MINIO_*`, `DATABASE_URL` (`.env`) | **Có** |

Tất cả các khóa bí mật chỉ nằm trong `.env` (đã nằm trong `.gitignore`). Khi đổi Zoom secret: sửa `.env`, `docker compose up -d backend`, rồi `make attendee-zoom`.

## 7. Chạy với bot thật (Attendee)

```bash
make setup                 # lần đầu, rồi điền .env: khóa MinIO, DATABASE_URL
make db-help               # in lệnh tạo người dùng và CSDL PostgreSQL
make up                    # dựng tất cả
make attendee-zoom         # nếu dùng Zoom (mục 4.7)
```

`make up` lần lượt: bảo đảm Ollama và mô hình, tải Attendee đúng phiên bản đã ghim vào `./attendee-src`, tạo cấu hình, build (khoảng 5 phút lần đầu), chạy ở cổng 8010, **tự tạo API key** và ghi vào `.env`, rồi dựng backend và giao diện.

Lệnh hay dùng: `make status`, `make logs`, `make restart` (sau khi sửa `.env` hay config), `make attendee-rekey` (khi báo 401), `make attendee-logs`, `make down`, `make use-demo` / `make use-attendee` để đổi bot.

### Dùng thử Zoom

1. Mở MeetMind, **Tạo phiên họp** → chọn **Zoom** → để trống link và giữ ô "Để MeetMind tạo cuộc họp Zoom cho tôi" → **Tạo phiên**.
2. Zoom hỏi quyền lần đầu: bấm **Allow**. Trình duyệt quay về phòng họp với link Zoom đã điền. Phải bắt đầu **từ nút tạo phòng của MeetMind**: vào thẳng URL callback hoặc dùng "Local test" của Zoom sẽ báo "Zoom không trả về mã xác nhận".
3. Tab **Zoom** (bên trái) tự vào họp bằng tên tài khoản MeetMind của bạn.
4. Bấm **Gọi bot vào họp** để bot Attendee vào lấy phụ đề.

### Chia sẻ màn hình trong Zoom nhúng

Người dùng nhúng vào họp với vai **người tham gia thường**, không phải host. Nếu Zoom báo không được chia sẻ, vào https://zoom.us/profile/setting → In Meeting (Basic) → Screen sharing → **Who can share? → All Participants**, rồi vào họp lại. Trình duyệt cũng phải được cấp quyền chia sẻ màn hình (biểu tượng ổ khóa cạnh địa chỉ). Vào bằng quyền host (token ZAK) chưa làm.

### Dùng thử Meet

1. Tạo phiên chọn **Google Meet**, bấm "Tạo phòng Meet" (hoặc dán link phòng có sẵn).
2. Vào phòng Meet ở tab riêng, bấm **Gọi bot vào họp**, và **Admit** bot nếu nó đứng ở phòng chờ.

Phụ đề Meet theo **một ngôn ngữ cho cả cuộc họp** (`MEET_CAPTION_LANG`, mặc định `vi-VN`). Bot là khách bên ngoài, mỗi bot mở một Chrome nên khá nặng.

## 8. Bảo mật

- **Đừng mở giao diện ra internet khi màn hình đăng nhập còn hiện mã 6 số** (`EMAIL_CODE=on` với email giả lập `console`): ai vào cũng đăng nhập được bằng email bất kỳ. Đặt `EMAIL_CODE=off` (chỉ còn đăng nhập Google) hoặc cấu hình SMTP thật.
- Ứng dụng Google ở chế độ **Testing** chỉ cho các email trong **Test users** đăng nhập. Đó là lớp chặn mặc định; kiểm tra danh sách chỉ có người bạn muốn. Có thể giới hạn thêm bằng `GOOGLE_ALLOWED_DOMAINS`.
- Nên thêm **Cloudflare Access** (Zero Trust → Access → Applications) trước hostname giao diện, chỉ cho email của bạn.
- Phương án A ở mục 5.2 là phương án an toàn nhất: chỉ đúng một đường dẫn của API ra internet.
- Token Cloudflare, Zoom secret, Google secret: nếu lộ, đổi ngay (Rotate token, Regenerate, thêm secret mới) và cập nhật `.env`.
- Token đăng nhập MeetMind lưu trong `localStorage` của trình duyệt.

## 9. Cơ sở dữ liệu và MinIO

Mặc định là SQLite (đủ để thử). Dùng **PostgreSQL** cho môi trường thật: `pip install -e '.[postgres]'`, `MEETMIND_DATABASE_URL=postgresql+asyncpg://meetmind:MAT_KHAU@localhost:5432/meetmind`. Tạo trước người dùng và CSDL (`make db-help`); bảng tự tạo khi backend chạy lần đầu, và cột mới của bản sau được thêm tự động (`ALTER TABLE`, chưa có Alembic). MySQL 8 chạy được nhưng chậm hơn; MariaDB chưa thử.

MinIO: `storage.adapter: minio` cùng endpoint, khóa và bucket trong `config.yaml`. Tài khoản cần quyền ghi, đọc, xóa object và tạo bucket.

## 10. Lỗi thường gặp

| Thông báo | Nguyên nhân | Cách sửa |
|---|---|---|
| Zoom: `Chuyển hướng không hợp lệ (4.700)` / `Invalid redirect URL` | URL không khớp từng ký tự, hoặc chưa lưu, hoặc dùng `http://` | Mục 4.4: dùng `https://` qua Cloudflare, khớp `ZOOM_REDIRECT_URI`, bấm Continue để lưu |
| Ô redirect của Zoom không cho gõ `localhost` | Zoom từ chối `localhost` | Dùng hostname Cloudflare (mục 5) |
| Cloudflare: `no tunnel` / `502` | `cloudflared` không chạy, hoặc dùng tunnel tạm đã hết hạn | `docker compose --profile tunnel logs cloudflared`; kiểm tra token trong `.env` |
| `cloudflared` thoát liên tục, log "requires the ID or name of the tunnel" | `CLOUDFLARE_TUNNEL_TOKEN` trống | Điền token (chuỗi `eyJ...`), `docker compose --profile tunnel up -d --force-recreate cloudflared` |
| "Zoom không trả về mã xác nhận" | Vào callback không qua nút tạo phòng của MeetMind | Bắt đầu lại từ nút tạo phòng; không dùng Local test của Zoom |
| "Zoom không cho tạo cuộc họp" | Thiếu scope `meeting:write:meeting` | Mục 4.5 |
| Video Zoom báo lỗi chữ ký / không vào | Chưa bật Meeting SDK, hoặc secret sai | Mục 4.5; kiểm tra `ZOOM_CLIENT_ID/SECRET` rồi `docker compose up -d backend` |
| Phiên Zoom cũ không nhúng được | Tạo trước khi lưu mật khẩu cuộc họp | Tạo phiên Zoom mới bằng nút tạo tự động |
| Bot không vào họp Zoom | Attendee chưa có khóa Zoom, hoặc họp của tài khoản Zoom khác | `make attendee-zoom`; `make attendee-logs`; họp phải do tài khoản tạo app chủ trì |
| Không chia sẻ được màn hình trong Zoom | Cuộc họp để "chỉ host chia sẻ" | Mục 7 |
| `The given origin is not allowed` | Thiếu JavaScript origin ở Google | Mục 3.3 |
| `redirect_uri_mismatch` (Google) | Thiếu hoặc sai redirect URI | Mục 3.3, khớp `PUBLIC_API_URL` |
| `org_internal` | Màn hình đồng ý đặt Internal | Chuyển sang External |
| `access_denied` khi tạo phòng Meet | Email chưa vào Test users hoặc thiếu scope | Mục 3.4 |
| `401` khi gọi bot | API key Attendee mất | `make attendee-rekey`, rồi `make attendee-zoom` |
| Bot vào Meet rồi ra, "You can't join this video call" | Google chặn khách ẩn danh | `make attendee-logs`; tạo phòng bằng nút **Tạo phòng Meet** (chế độ `OPEN`); kiểm tra phòng không chỉ cho người trong tổ chức |
| Word/PowerPoint không mở | Thiếu LibreOffice | Cài `soffice` |
| Giao diện cũ sau khi sửa code hoặc `.env` | Docker dùng bản đã build; địa chỉ API gắn cứng lúc build | `docker compose up -d --build frontend backend` |

## 11. Việc còn lại

- Thử phụ đề Zoom trong một cuộc họp có người nói thật, đo độ đúng của tên người nói.
- Vào Zoom bằng quyền host (token ZAK) để có đủ quyền chia sẻ màn hình và điều khiển phòng.
- Chuyển từ bot Attendee sang **Zoom RTMS**: Zoom ghi rõ Meeting SDK không dành cho bot hoặc trợ lý ghi chú AI. Bot hiện tại chạy được khi phát triển nhưng có thể bị chặn khi phát hành rộng.
- Nộp app Zoom để duyệt (và dùng token OBF) nếu cần họp của tài khoản Zoom khác.
- Thử một cuộc họp Google Meet thật từ đầu đến cuối; quyết định đưa ứng dụng Google lên In production hay giữ Testing.

## 12. Ai dùng được hệ thống (chế độ thử nghiệm)

Ứng dụng Google ở chế độ **Testing** và app Zoom ở chế độ **Development** (chưa phát hành). Hai chế độ này giới hạn ai đăng nhập, ai tạo họp và họp của ai bot vào được. Phần Google đã biết chắc; phần Zoom tôi suy ra từ cách Zoom hoạt động chứ chưa thử với tài khoản Zoom thứ hai.

### 12.1 Ai làm được gì

| Việc | Ai làm được | Điều kiện |
|---|---|---|
| Tạo phiên họp trong MeetMind | Mọi thành viên của tổ chức | Chỉ cần thuộc tổ chức (mã không phân biệt vai trò) |
| Đăng nhập MeetMind bằng Google | Chỉ email nằm trong **Test users** | Tối đa 100 email |
| Tạo phòng Google Meet từ MeetMind | Test user đã đồng ý với Google một lần | Đã thêm scope `meetings.space.created` (mục 3.4) |
| Tạo cuộc họp Zoom tự động | Tài khoản Zoom của **chủ app** (có thể cả tài khoản cùng tổ chức Zoom) | App Zoom chưa duyệt: người dùng tài khoản Zoom khác bị Zoom chặn khi xin quyền (chưa biết thông báo chính xác) |
| Bot và video nhúng vào họp Zoom | Họp do **tài khoản chủ app** tạo | Họp của tài khoản Zoom khác cần app được duyệt và token OBF (chưa thử) |
| Vào họp bằng link Meet hoặc Zoom | Bất kỳ ai có link | Không cần tài khoản MeetMind |
| Xem phụ đề, tài liệu, biên bản | Người đã đăng nhập MeetMind và được mời | Phải là Test user vì đăng nhập qua Google |

Người chỉ cần **dự họp** (bấm link vào Meet hoặc Zoom) không cần gì ở Google hay MeetMind. Người muốn **xem trong MeetMind** thì phải đăng nhập, nên phải có tên trong Test users.

### 12.2 Thêm người dùng thử (Google Test users)

1. https://console.cloud.google.com, chọn đúng dự án chứa OAuth client của MeetMind.
2. **Google Auth Platform** (hoặc APIs & Services → OAuth consent screen) → mục **Audience**.
3. Kéo xuống **Test users** → **Add users** → nhập Gmail của từng người (mỗi dòng một email) → **Save**.
4. Có hiệu lực ngay hoặc sau vài phút. Người đó phải đăng nhập MeetMind bằng **đúng email vừa thêm**.
5. Trong MeetMind, mời họ vào tổ chức (trang tổ chức, mời bằng email) hoặc vào một phiên (tab Người tham gia → Mời tham gia). Người chưa có tài khoản sẽ vào ngay khi đăng nhập lần đầu bằng đúng email đó.

Nếu người dùng bị Google chặn khi đăng nhập ("Access blocked" hoặc "app chưa được xác minh"), gần như chắc chắn email của họ chưa nằm trong Test users, hoặc họ đăng nhập bằng một tài khoản Google khác.

### 12.3 Mở rộng ra ngoài giới hạn thử nghiệm

| Hướng | Việc cần làm | Đánh đổi |
|---|---|---|
| Hơn 100 người, hoặc không muốn thêm từng email | Đưa ứng dụng Google lên **In production** (Audience → Publish app) | Scope Meet thuộc nhóm nhạy cảm nên Google có thể yêu cầu **xác minh ứng dụng** (trang chính sách riêng tư, video giải thích); mất thời gian. Có thể chỉ cho một tên miền email bằng `GOOGLE_ALLOWED_DOMAINS=["congty.com"]` |
| Mọi người trong tổ chức tạo họp Zoom (dùng nội bộ) | Một tài khoản Zoom chung làm chủ phòng: tạo app **Server-to-Server OAuth**, backend tự tạo họp dưới tài khoản đó, không ai phải cấp quyền Zoom. Họp thuộc tài khoản chung nên bot và video nhúng vào được | Chưa làm trong mã. Zoom Pro thường chỉ cho **một cuộc họp cùng lúc trên một tài khoản chủ trì**; nhiều họp song song cần nhiều chủ trì hoặc thêm giấy phép |
| Khách hàng dùng bằng tài khoản Zoom riêng của họ | **Nộp app Zoom để duyệt** (Marketplace) và dùng token OBF; về lâu dài dùng **RTMS** (Zoom không hỗ trợ bot dùng Meeting SDK) | Duyệt mất vài tuần đến vài tháng; RTMS cần Zoom Developer Pack có phí (xem mục 11) |

Nên giữ chế độ thử nghiệm khi chỉ dùng trong nhóm nhỏ quen biết; chuyển sang phát hành chỉ khi cần người lạ tự đăng ký dùng.
