# MeetMind

Quản lý phiên họp Google Meet: phụ đề trực tiếp theo ngôn ngữ từng người, tài liệu chia sẻ trong họp, biên bản tự động.
Cuộc họp vẫn diễn ra ở tab Google Meet riêng; MeetMind là web chạy cạnh đó, và một bot (Attendee) vào họp để lấy lời nói.

## Đã làm được

| Nhóm | Chức năng |
|---|---|
| Tài khoản | Đăng nhập bằng Google (Google xác minh email). Không mật khẩu. Khi chưa cấu hình Google, hoặc đặt `MEETMIND_EMAIL_CODE=on`, có thêm đăng nhập bằng mã 6 số gửi qua email (mã dùng một lần, hết hạn sau 10 phút, sai 5 lần thì khóa) |
| Tổ chức | Tạo tổ chức; mời thành viên bằng email (người chưa có tài khoản vào tổ chức ngay khi đăng nhập lần đầu bằng đúng email đó); vai trò chủ sở hữu / quản trị viên / thành viên; thu hồi lời mời, xóa thành viên, rời tổ chức; luôn còn ít nhất một chủ sở hữu |
| Phiên họp | Thuộc một tổ chức; mời người tham gia bằng email (cả người ngoài tổ chức, họ là khách của phiên đó); chủ trì và đồng chủ trì; mã tham gia dự phòng |
| Phụ đề | Bot vào Meet, phụ đề hiện trực tiếp kèm tên người nói; mỗi người chọn ngôn ngữ đọc riêng, chỉ dịch những ngôn ngữ đang có người đọc; đổi ngôn ngữ giữa chừng thì dịch bù phần vừa qua |
| Tài liệu | Chủ trì tải lên PDF / Word / PowerPoint (tự chuyển sang PDF), lưu trong MinIO theo tổ chức và phiên; nhiều tài liệu, nhiều tab; chuyển tab không mất vị trí đang đọc; cho phép hoặc cấm thành viên tải bản gốc |
| Theo dõi người trình bày | Một người trình bày điều khiển vị trí đọc của cả phòng; người xem có thể tự đọc rồi quay lại, hoặc về chỗ mình đang đọc dở; thành viên xin quyền, chủ trì duyệt hoặc trao quyền |
| Biên bản | Tự soạn khi họp kết thúc: tóm tắt, chủ đề, quyết định, công việc (người phụ trách, thời hạn), mỗi mục dẫn về câu gốc; chủ trì sửa, lưu nháp, chốt; xuất Word và Markdown |

## Chạy thử (chế độ demo, không cần gì thêm)

Bot được giả lập bằng một cuộc họp mẫu, "mô hình ngôn ngữ" là bộ quy tắc đơn giản, email chỉ ghi ra log
(mã đăng nhập hiện ngay trên màn hình đăng nhập).

```bash
# backend
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:create_app --factory --port 8000 --loop asyncio

# frontend (cửa sổ khác)
cd frontend
npm install
npm run dev            # http://localhost:3000
```

Đăng nhập bằng email bất kỳ, tạo tổ chức, tạo phiên họp kèm một link dạng `https://meet.google.com/abc-defg-hij`
(ở chế độ demo link chỉ để điền cho đủ, bot giả lập không mở nó), rồi bấm "Gọi bot vào họp".

Luôn chạy uvicorn với `--loop asyncio`: uvloop không khởi chạy được LibreOffice (chuyển Word/PowerPoint sang PDF) trên Python 3.14.
Chuyển Word/PowerPoint cần cài LibreOffice (`soffice`); PDF thì không cần.

## Chạy thật

1. Sao chép `backend/config/config.example.yaml` thành `backend/config/config.yaml`, chọn adapter và điền thông tin (bot Attendee, Ollama hoặc vLLM, MinIO, SMTP).
   Bí mật để trong biến môi trường, viết `${TEN_BIEN}` trong file.
2. Đặt `MEETMIND_JWT_SECRET` (chuỗi ngẫu nhiên dài) và `MEETMIND_APP_URL` (địa chỉ web, dùng cho liên kết trong email). Xem `backend/.env.example`.
3. Docker: `make setup`, điền `.env` (khóa MinIO, `DATABASE_URL`), rồi **`make up`**: một lệnh dựng tất cả (Ollama, bot Attendee, backend, giao diện). Lệnh `make` liệt kê mọi lệnh.
   Compose chỉ chạy backend và giao diện; MinIO, Postgres và Ollama là của máy bạn. Backend chạy ở mạng của máy chủ (`network_mode: host`, chỉ Linux) để nối tới các dịch vụ đang nghe ở `localhost`.

### Tạo phòng Google Meet từ MeetMind

Nút **Tạo phòng Meet** gọi Google Meet API thay bạn, nên không cần mở meet.new rồi dán link. Người dùng đồng ý với Google một lần; hệ thống lấy mã xác nhận,
tạo phòng ngay, lưu link vào phiên họp rồi bỏ token (không lưu refresh token). Phòng được tạo ở chế độ **mở** (`MEET_ACCESS_TYPE=OPEN`): ai có link cũng vào được,
nên bot không phải đứng chờ bạn bấm Cho phép.

Cần `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` trong `.env` (và `backend/.env` khi chạy trực tiếp). Trong Google Cloud Console của project chứa client đó:

1. **Bật Google Meet REST API** (APIs & Services, Library).
2. Màn hình đồng ý OAuth: thêm scope `https://www.googleapis.com/auth/meetings.space.created`; nếu ứng dụng ở chế độ thử nghiệm thì thêm email của bạn vào Test users.
3. Credentials, mở client: **Authorized redirect URIs** thêm `http://localhost:8000/api/google/callback` (đổi theo `PUBLIC_API_URL` khi triển khai thật).
4. Cùng client đó, **Authorized JavaScript origins** thêm `http://localhost:3000` (cho nút đăng nhập Google).

Thiếu bước nào Google báo ngay khi bấm: thiếu redirect URI thì `redirect_uri_mismatch`, thiếu origin thì `The given origin is not allowed`. Thay đổi trong Console có thể mất vài phút mới có hiệu lực.

### Họp thật trên Google Meet (bot Attendee)

`make up` dùng bot thật theo mặc định. Nó dựng [Attendee](https://github.com/attendee-labs/attendee) (bot vào phòng Meet như một khách tên "MeetMind",
lấy phụ đề có sẵn của Meet) và **tự tạo API key**, bạn không phải tạo tài khoản hay dán khóa. Cụ thể `make up` làm lần lượt:

1. `ollama`: bảo đảm Ollama chạy và có mô hình `qwen2.5:3b` (tự khởi động, tự tải nếu thiếu);
2. `attendee`: tải đúng phiên bản Attendee đã đối chiếu (ghim theo commit) vào `./attendee-src`, tạo cấu hình (bản ghi cuộc họp lưu vào bucket `attendee` trong MinIO của bạn), build và chạy ở http://localhost:8010, chạy migrate, rồi tạo API key và ghi vào `.env` và `backend/.env`;
3. dựng backend và giao diện.

Lần đầu build Attendee mất khoảng 5 phút. Các lệnh con chạy riêng được: `make attendee`, `make attendee-rekey` (tạo lại khóa nếu báo 401), `make status`, `make down` (dừng cả hai).
Muốn thử không cần Meet: `make up-demo` (bot giả lập, không dựng Attendee); đổi qua lại bằng `make use-demo` / `make use-attendee`.

Dùng thử: trong MeetMind tạo phiên họp, bấm "Tạo phòng Meet" để mở phòng mới, dán link vào phiên, vào phòng Meet, bấm **Gọi bot vào họp**
và **Cho phép (Admit)** bot khi nó xuất hiện ở phòng chờ.

Cần biết:
- **Phụ đề Meet theo một ngôn ngữ cố định cho cả cuộc họp** (`MEET_CAPTION_LANG`, mặc định `vi-VN`). Người nói ngôn ngữ khác sẽ bị nhận sai. Họp trộn Việt/Anh cần phiên âm có tự nhận ngôn ngữ (ví dụ Deepgram trong Attendee), chưa làm.
- Bot là **khách bên ngoài**. Nếu cuộc họp chỉ cho người trong tổ chức Google tham gia thì bot bị từ chối.
- Attendee tính "credits" cho bản dùng trả phí và từ chối tạo bot khi hết; với bản tự chạy này `make attendee-key` đặt giá trị rất lớn nên không bị chặn.
- Mỗi bot mở một trình duyệt Chrome nên khá nặng; chưa đo mức dùng RAM.

### Đăng nhập bằng Google

Đặt `MEETMIND_GOOGLE_CLIENT_ID` (Client ID là mã công khai, không phải bí mật). Client ID đang dùng là của dự án Google Cloud "Cuahang" (tái sử dụng theo ý bạn).
**Việc bắt buộc:** trong Google Cloud Console, mục Credentials, mở OAuth client đó, thêm địa chỉ web của MeetMind vào *Authorized JavaScript origins*
(ví dụ `http://localhost:3000`, và tên miền thật khi triển khai). Chưa thêm thì nút Google hiện ra nhưng bấm vào sẽ báo
"The given origin is not allowed for the given client ID" (client "Cuahang" hiện chỉ khai báo Authorized redirect URIs, mục Authorized JavaScript origins đang trống).
Thay đổi ở Google có thể mất vài phút mới có hiệu lực.

- `MEETMIND_GOOGLE_ALLOWED_DOMAINS=["congty.com"]` giới hạn theo tên miền email (để trống = mọi tài khoản Google).
- `MEETMIND_EMAIL_CODE=auto|on|off`: `auto` chỉ bật đăng nhập bằng mã khi chưa có Google; `off` tắt hẳn. Hiện `backend/.env` và `.env` để `on` làm đường lui
  cho tới khi Google chạy được; khi đó hãy đổi thành `off` (nếu giữ `on` với email giả lập `console`, mã hiện ngay trên màn hình nên ai cũng đăng nhập được bằng email bất kỳ).
- Lời mời gửi tới một địa chỉ email sẽ tự áp dụng khi chủ địa chỉ đó đăng nhập bằng Google (đã có test).

### Cơ sở dữ liệu

Mặc định là SQLite (đủ để chạy thử). Dùng **PostgreSQL** cho môi trường thật:

```bash
pip install -e '.[postgres]'
export MEETMIND_DATABASE_URL='postgresql+asyncpg://meetmind:MAT_KHAU@localhost:5432/meetmind'
```

Tạo trước người dùng và CSDL (`make db-help`); các bảng tự tạo khi backend chạy lần đầu. MySQL 8 cũng chạy được
(`pip install -e '.[mysql]'`, URL dạng `mysql+aiomysql://...?charset=utf8mb4`) nhưng chậm hơn và cần thêm gói `cryptography`; MariaDB chưa thử.
Nên dùng Postgres.

### MinIO

Dùng MinIO có sẵn: đặt `storage.adapter: minio` cùng endpoint, khóa truy cập và tên bucket trong `config.yaml`. Tài khoản cần quyền
ghi, đọc, xóa object và tạo bucket (nếu bucket chưa có, backend tự tạo lúc khởi động; nếu không có quyền thì hãy tạo bucket trước).

Gợi ý mô hình cho máy có GPU 4 GB (chưa thử): Whisper cỡ `small` (int8) và một mô hình khoảng 3B tham số qua Ollama cho dịch. Mô hình lớn hơn cho biên bản nếu máy chịu được.

## Cấu trúc mã

```
backend/
  core/            nghiệp vụ, không import adapter hay thư viện hạ tầng
    models.py ports.py        mô hình và các interface (MeetingBot, LLM, Translator, ObjectStore, EmailSender, Repository ...)
    services/                 auth, orgs, invitations, meetings, documents, presenter, live_pipeline, minutes ...
  adapters/        cài đặt cụ thể của từng port: bot (attendee, fake), llm (openai_compat, demo), translate, storage (minio, local),
                   email (smtp, console), db (SQLAlchemy), docproc (LibreOffice), export (docx, markdown), asr (faster-whisper)
  app/             FastAPI: routes, WebSocket, container.py (nơi duy nhất biết adapter nào ứng với port nào)
  prompts/         prompt có đánh số phiên bản (translate.v1.md ...)
  tests/
frontend/          Next.js + TypeScript, CSS thuần
  src/hooks/       useMeetingRoom (REST + WebSocket), useDocTabs (tab và vị trí đọc)
  src/components/  PdfViewer, DocumentPane, TranscriptPanel, ParticipantsPanel, InviteBox ...
docs/              ARCHITECTURE.md, DESIGN.md (thiết kế ban đầu; README này mới phản ánh hiện trạng)
```

Đổi bot, mô hình, kho lưu trữ hay cách gửi email là thêm một adapter hoặc sửa `config.yaml`, không đụng phần `core`.

## Kiểm thử

```bash
cd backend && pytest                                   # 27 test, 1 test MinIO bị bỏ qua nếu không có MinIO
MEETMIND_TEST_DATABASE_URL=postgresql+asyncpg://u@localhost:5432/csdl_rong pytest   # chạy cả bộ test trên Postgres (XÓA mọi bảng của CSDL đó, dùng CSDL riêng)
MEETMIND_TEST_MINIO=localhost:9000 pytest              # chạy cả test với MinIO thật (khóa: MEETMIND_TEST_MINIO_KEY / _SECRET)
cd frontend && npm run typecheck && npm run build
```

Đã chạy: toàn bộ test backend (kể cả MinIO thật và chuyển Word sang PDF bằng LibreOffice thật), cùng bộ test đó trên PostgreSQL 18 và MySQL 8, và một kịch bản trình duyệt thật
với hai người dùng (đăng nhập bằng mã, mời qua email, tải hai tài liệu, chuyển tab, theo dõi người trình bày, phụ đề dịch, biên bản, xuất Word): 21/21 bước đạt.

## Chưa được kiểm chứng

- **Attendee**: các lệnh `make attendee-*` và adapter chưa chạy với một Attendee đang chạy. Adapter đã được đối chiếu với **mã nguồn Attendee** (đường dẫn `/api/v1/bots`, `/leave`, `/transcript`, tiêu đề `Authorization: Token ...`,
  tên trạng thái, dạng transcript), nhưng chưa chạy với một Attendee đang chạy hay một cuộc họp thật. Đối chiếu đó giúp sửa một lỗi thật: Attendee cập nhật lời thoại tại chỗ khi người ta còn đang nói,
  nên adapter giờ phát bản tạm rồi bản chốt. Với Google Meet, Attendee mặc định lấy phụ đề có sẵn của Meet (không cần dịch vụ phiên âm ngoài), nhưng chất lượng, độ trễ và việc tên người nói có khớp tài khoản MeetMind hay không vẫn chưa biết.
- **Đăng nhập Google**: kiểm tra token, miền và email đã xác minh được test bằng bộ kiểm tra giả lập; chưa đăng nhập được thật vì origin chưa được cho phép (xem mục trên).
- **Mô hình ngôn ngữ**: đã chạy thật với Ollama và `qwen2.5:3b` trên RTX 3050 4 GB. Dịch trung vị khoảng 0,4 giây một câu; cả phiên họp mẫu xong trong khoảng 26 giây. Chất lượng ở cỡ 3B chỉ tạm dùng: biên bản mới bắt được khoảng 1/4 công việc trong cuộc họp mẫu, đôi khi lặp chữ trong bản tóm tắt; quyết định và dẫn nguồn khá đúng. Chưa thử cỡ 7B và chưa thử vLLM.
- **SMTP** (chưa gửi email thật), **faster-whisper**, **MariaDB**, và việc **build các Docker image**.
- Chưa thử với một cuộc họp Google Meet thật.

## Hạn chế đã biết

- Một tiến trình API: bus sự kiện và trạng thái người trình bày nằm trong bộ nhớ. Muốn chạy nhiều tiến trình cần adapter Redis.
- CSDL tạo bảng bằng `create_all`, chưa có migration (Alembic). Đổi schema thì phải tạo lại hoặc tự migrate.
- Không có lớp văn bản trong trình xem PDF (chưa chọn và sao chép chữ được).
- Mã đăng nhập chưa giới hạn tần suất theo địa chỉ IP; mới giới hạn theo email (30 giây một mã, 5 lần nhập sai).
- Token đăng nhập lưu trong `localStorage`.
- Bảng thuật ngữ (glossary) từ tài liệu cho dịch chưa làm; dự phòng chuyển giọng nói từ bản ghi âm của Attendee chưa làm.
- Quản trị viên tổ chức chưa xem được danh sách phiên họp mà mình không tham gia.
