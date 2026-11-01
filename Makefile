# MeetMind. `make up` dựng TẤT CẢ: Ollama, bot Attendee (Google Meet thật), backend và giao diện.
# Gõ `make` để xem danh sách lệnh.
.DEFAULT_GOAL := help
COMPOSE ?= docker compose
API_URL ?= http://localhost:8000
WEB_URL ?= http://localhost:3000
OLLAMA_MODEL ?= qwen2.5:3b

CONFIG := backend/config/config.yaml

# Attendee: bot vào Google Meet. Mã nguồn được tải về ./attendee-src đúng phiên bản đã đối chiếu, chạy bằng compose riêng của nó.
ATTENDEE_DIR ?= attendee-src
ATTENDEE_REPO ?= https://github.com/attendee-labs/attendee
ATTENDEE_REF ?= eaacec16f2939b595f196b3957a717bbb0ed23e9
ATTENDEE_COMPOSE = $(COMPOSE) -p meetmind-attendee --project-directory $(ATTENDEE_DIR) \
	-f $(ATTENDEE_DIR)/dev.docker-compose.yaml -f deploy/attendee/compose.override.yaml

define dotenv_get
$$(grep -E '^$(1)=' .env | head -1 | cut -d= -f2-)
endef

.PHONY: help setup check check-env db-help ollama up up-demo start down restart logs ps status shell test reset-data reset-config \
	attendee attendee-setup attendee-bucket attendee-start attendee-key attendee-rekey attendee-down attendee-logs use-attendee use-demo

help: ## Danh sách lệnh
	@echo "MeetMind"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-16s %s\n", $$1, $$2}'
	@echo
	@echo "Lần đầu:  make setup  -> điền .env (MinIO, Postgres; xem make db-help) -> make up"
	@echo "Sau đó mở $(WEB_URL). make up tự dựng cả Attendee và tạo API key, không cần làm tay."
	@echo "Mở từ máy khác trong mạng: make up PUBLIC_API_BASE=http://<ip-máy-chủ>:8000 MEETMIND_APP_URL=http://<ip-máy-chủ>:3000"

.env:
	@echo "Tạo .env với khóa bí mật ngẫu nhiên"
	@printf '%s\n' \
		"MEETMIND_JWT_SECRET=$$(python3 -c 'import secrets; print(secrets.token_hex(32))')" \
		'MINIO_ENDPOINT=localhost:9000' \
		'MINIO_ACCESS_KEY=' \
		'MINIO_SECRET_KEY=' \
		'MINIO_BUCKET=meetmind' \
		'DATABASE_URL=postgresql+asyncpg://meetmind:CHANGE_ME@localhost:5432/meetmind' \
		'SMTP_USERNAME=' \
		'SMTP_PASSWORD=' \
		'GOOGLE_CLIENT_ID=334563412386-cgjjso3vum67fdaqnl1lh2u70b2gea5c.apps.googleusercontent.com' \
		'GOOGLE_CLIENT_SECRET=' \
		'PUBLIC_API_URL=http://localhost:8000' \
		'GOOGLE_ALLOWED_DOMAINS=[]' \
		'EMAIL_CODE=on' \
		'BOT_ADAPTER=attendee' \
		'ATTENDEE_URL=http://localhost:8010' \
		'ATTENDEE_API_KEY=' \
		'MEET_CAPTION_LANG=vi-VN' > .env
	@echo ">> Mở .env và điền MINIO_ACCESS_KEY, MINIO_SECRET_KEY, DATABASE_URL (xem: make db-help)"

$(CONFIG):
	@echo "Tạo $(CONFIG): bot Attendee, dịch và biên bản bằng Ollama, tài liệu lưu trong MinIO của bạn"
	@mkdir -p backend/config
	@printf '%s\n' \
		'# Cấu hình chạy bằng Docker. Mẫu đầy đủ: config.example.yaml.' \
		'bot:' \
		'  adapter: $${BOT_ADAPTER:-attendee}' \
		'  base_url: $${ATTENDEE_URL:-http://localhost:8010}' \
		'  api_key: $${ATTENDEE_API_KEY:-}' \
		'  transcription_settings:' \
		'    meeting_closed_captions:' \
		'      google_meet_language: $${MEET_CAPTION_LANG:-vi-VN}' \
		'      merge_consecutive_captions: true' \
		'llm:' \
		'  adapter: openai_compat' \
		'  base_url: http://localhost:11434/v1' \
		'  realtime_model: $(OLLAMA_MODEL)' \
		'  report_model: $(OLLAMA_MODEL)' \
		'  timeout_s: 180' \
		'translator:' \
		'  adapter: llm' \
		'storage:' \
		'  adapter: minio' \
		'  endpoint: $${MINIO_ENDPOINT}' \
		'  access_key: $${MINIO_ACCESS_KEY}' \
		'  secret_key: $${MINIO_SECRET_KEY}' \
		'  bucket: $${MINIO_BUCKET}' > $(CONFIG)

setup: .env $(CONFIG) ## Tạo .env (khóa ngẫu nhiên) và config nếu chưa có (không ghi đè file đã có)

check-env: setup
	@missing=""; for k in MINIO_ACCESS_KEY MINIO_SECRET_KEY; do \
		grep -Eq "^$$k=.+" .env || missing="$$missing $$k"; done; \
	grep -q "CHANGE_ME" .env && missing="$$missing DATABASE_URL"; \
	if [ -n "$$missing" ]; then echo "Chưa điền trong .env:$$missing"; echo "Xem hướng dẫn tạo CSDL: make db-help"; exit 1; fi

check: check-env ## Kiểm tra .env đã điền đủ và docker-compose.yml hợp lệ
	@$(COMPOSE) config -q && echo ".env đủ thông tin, docker-compose.yml hợp lệ"

db-help: ## In lệnh tạo người dùng và CSDL PostgreSQL cho MeetMind
	@echo "Chạy trong psql với tài khoản quản trị Postgres của bạn, rồi đặt mật khẩu vào DATABASE_URL trong .env:"
	@echo
	@echo "  CREATE USER meetmind WITH PASSWORD 'mat-khau-cua-ban';"
	@echo "  CREATE DATABASE meetmind OWNER meetmind;"
	@echo
	@echo "Các bảng tự tạo khi backend khởi động lần đầu."

# ---------------------------------------------------------------- Ollama
ollama: ## Bảo đảm Ollama đang chạy và có mô hình (tự khởi động / tải nếu thiếu)
	@command -v ollama >/dev/null || { echo "Chưa cài Ollama (https://ollama.com). Cài rồi chạy lại."; exit 1; }
	@curl -fs http://localhost:11434/api/version >/dev/null 2>&1 || { \
		echo "Khởi động Ollama..."; nohup ollama serve >/tmp/ollama.log 2>&1 & \
		for i in $$(seq 1 30); do curl -fs http://localhost:11434/api/version >/dev/null 2>&1 && break; sleep 1; done; }
	@curl -fs http://localhost:11434/api/version >/dev/null 2>&1 || { echo "Ollama không khởi động được. Xem /tmp/ollama.log"; exit 1; }
	@ollama list | grep -q "^$(OLLAMA_MODEL)" || { echo "Tải mô hình $(OLLAMA_MODEL) (khoảng 2 GB)..."; ollama pull $(OLLAMA_MODEL); }
	@echo "Ollama sẵn sàng, mô hình $(OLLAMA_MODEL)"

# ---------------------------------------------------------------- Attendee (bot vào Google Meet)
attendee-setup: check-env ## Tải Attendee về, tạo cấu hình cho nó (lưu bản ghi vào MinIO của bạn)
	@if [ ! -d $(ATTENDEE_DIR)/.git ]; then \
		echo "Tải Attendee ($(ATTENDEE_REF))"; mkdir -p $(ATTENDEE_DIR) && cd $(ATTENDEE_DIR) && git init -q && \
		git remote add origin $(ATTENDEE_REPO) && git fetch -q --depth 1 origin $(ATTENDEE_REF) && git checkout -q FETCH_HEAD; fi
	@if [ -f $(ATTENDEE_DIR)/.env ]; then echo "$(ATTENDEE_DIR)/.env đã có, giữ nguyên"; else \
		echo "Tạo $(ATTENDEE_DIR)/.env"; \
		printf '%s\n' \
			"CREDENTIALS_ENCRYPTION_KEY=$$(python3 -c 'import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())')" \
			"DJANGO_SECRET_KEY=$$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')" \
			"AWS_ACCESS_KEY_ID=$(call dotenv_get,MINIO_ACCESS_KEY)" \
			"AWS_SECRET_ACCESS_KEY=$(call dotenv_get,MINIO_SECRET_KEY)" \
			"AWS_DEFAULT_REGION=us-east-1" \
			"AWS_ENDPOINT_URL=http://host.docker.internal:9000" \
			"AWS_RECORDING_STORAGE_BUCKET_NAME=attendee" > $(ATTENDEE_DIR)/.env; \
	fi
	@$(MAKE) --no-print-directory attendee-bucket

attendee-bucket: ## Tạo bucket "attendee" trong MinIO (nơi Attendee lưu bản ghi cuộc họp)
	@set -a; . ./.env; set +a; backend/.venv/bin/python -c "\
import os; from minio import Minio; \
c = Minio(os.environ['MINIO_ENDPOINT'], os.environ['MINIO_ACCESS_KEY'], os.environ['MINIO_SECRET_KEY'], secure=False); \
(c.bucket_exists('attendee') or c.make_bucket('attendee')); print('Bucket attendee sẵn sàng')"

attendee-start: ## Build (khoảng 5 phút lần đầu) và chạy Attendee ở http://localhost:8010, rồi chạy migrate
	@[ -f $(ATTENDEE_DIR)/.env ] || { echo "Chạy make attendee-setup trước"; exit 1; }
	$(ATTENDEE_COMPOSE) up -d --build
	@printf "Đợi Attendee sẵn sàng"; ok=""; for i in $$(seq 1 90); do \
		$(ATTENDEE_COMPOSE) exec -T attendee-app-local python manage.py migrate >/dev/null 2>&1 && ok=1 && break; printf "."; sleep 3; done; echo; \
	[ -n "$$ok" ] || { echo "Attendee không sẵn sàng. Xem: make attendee-logs"; exit 1; }

attendee-key: ## Tạo API key cho MeetMind trong Attendee (tự động, chỉ làm khi chưa có)
	@if grep -Eq '^ATTENDEE_API_KEY=.+' .env; then echo "ATTENDEE_API_KEY đã có, giữ nguyên"; else \
		key=$$($(ATTENDEE_COMPOSE) exec -T attendee-app-local python manage.py shell < deploy/attendee/create_api_key.py 2>/dev/null | grep '^API_KEY=' | cut -d= -f2); \
		[ -n "$$key" ] || { echo "Không tạo được API key. Xem: make attendee-logs"; exit 1; }; \
		python3 deploy/set_env.py .env ATTENDEE_API_KEY "$$key"; python3 deploy/set_env.py backend/.env ATTENDEE_API_KEY "$$key"; \
		echo "Đã tạo API key cho MeetMind và ghi vào .env, backend/.env"; fi

attendee-rekey: ## Tạo lại API key (dùng khi đã xóa dữ liệu Attendee hoặc báo 401)
	@python3 deploy/set_env.py .env ATTENDEE_API_KEY ""
	@$(MAKE) --no-print-directory attendee-key

attendee: attendee-setup attendee-start attendee-key ## Dựng Attendee từ đầu đến cuối (tải, chạy, tạo API key)

attendee-logs: ## Xem log Attendee
	$(ATTENDEE_COMPOSE) logs -f --tail=100 attendee-app-local attendee-worker-local

attendee-down: ## Dừng Attendee (giữ dữ liệu)
	@[ -d $(ATTENDEE_DIR) ] && $(ATTENDEE_COMPOSE) down || true

use-attendee: ## Dùng bot Attendee thật (cần ATTENDEE_API_KEY)
	@[ -n "$(call dotenv_get,ATTENDEE_API_KEY)" ] || { echo "Chưa có ATTENDEE_API_KEY (make attendee-key)"; exit 1; }
	@python3 deploy/set_env.py .env BOT_ADAPTER attendee; python3 deploy/set_env.py backend/.env BOT_ADAPTER attendee

use-demo: ## Dùng bot giả lập (cuộc họp mẫu, không cần Attendee)
	@python3 deploy/set_env.py .env BOT_ADAPTER fake; python3 deploy/set_env.py backend/.env BOT_ADAPTER fake

# ---------------------------------------------------------------- Toàn bộ hệ thống
up: check-env ollama attendee use-attendee start ## DỰNG TẤT CẢ: Ollama, Attendee (Meet thật), backend, giao diện

up-demo: check-env ollama use-demo start ## Như up nhưng dùng bot giả lập, không dựng Attendee

start:
	$(COMPOSE) up -d --build
	@printf "Đợi backend sẵn sàng"
	@for i in $$(seq 1 90); do \
		curl -fs $(API_URL)/api/health >/dev/null 2>&1 && break; \
		printf "."; sleep 1; \
	done; echo
	@curl -fs $(API_URL)/api/health >/dev/null 2>&1 \
		&& { echo "Sẵn sàng:"; echo "  Ứng dụng   $(WEB_URL)"; echo "  API        $(API_URL)/docs"; echo "  Bot        $$(grep -E '^BOT_ADAPTER=' .env | cut -d= -f2)"; } \
		|| { echo "Backend chưa trả lời. Xem log: make logs"; exit 1; }

down: ## Dừng tất cả (MeetMind và Attendee), giữ dữ liệu
	$(COMPOSE) down
	@$(MAKE) --no-print-directory attendee-down

restart: ## Khởi động lại backend (sau khi sửa config/config.yaml hoặc .env)
	$(COMPOSE) restart backend

logs: ## Xem log MeetMind theo thời gian thực (Ctrl+C để thoát)
	$(COMPOSE) logs -f --tail=100

ps: ## Trạng thái các dịch vụ
	$(COMPOSE) ps
	@[ -d $(ATTENDEE_DIR) ] && $(ATTENDEE_COMPOSE) ps || true

status: ## Hỏi từng dịch vụ có đang sống không
	@curl -fs $(API_URL)/api/health >/dev/null 2>&1 && echo "backend:   chạy ($(API_URL))" || echo "backend:   không trả lời"
	@curl -fs -o /dev/null $(WEB_URL)/login 2>&1 && echo "frontend:  chạy ($(WEB_URL))" || echo "frontend:  không trả lời"
	@curl -s -o /dev/null -w '%{http_code}' http://localhost:8010/api/v1/bots 2>/dev/null | grep -qE '^(200|401|403)$$' && echo "attendee:  chạy (http://localhost:8010)" || echo "attendee:  không trả lời"
	@curl -fs http://localhost:11434/api/version >/dev/null 2>&1 && echo "ollama:    chạy" || echo "ollama:    không trả lời"

shell: ## Mở shell trong container backend
	$(COMPOSE) exec backend bash

test: ## Chạy test backend trên máy (cần backend/.venv)
	cd backend && . .venv/bin/activate && python -m pytest -q

reset-data: ## XÓA toàn bộ dữ liệu MeetMind (volume Docker) và dừng hệ thống. Không xóa CSDL Postgres và MinIO của bạn
	$(COMPOSE) down -v

reset-config: ## Xóa config/config.yaml để tạo lại ở lần sau
	rm -f $(CONFIG)
