"""Composition root: the only place that knows which adapter implements which port."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable

from adapters.asr.faster_whisper import FasterWhisperASR
from adapters.auth.google import GoogleIdentityVerifier
from adapters.bot.attendee import AttendeeBot
from adapters.bot.fake import FakeBot
from adapters.bus.memory import MemoryBus
from adapters.db.sql import SqlRepository
from adapters.docproc.libreoffice import LibreOfficeProcessor
from adapters.email.console import ConsoleEmailSender
from adapters.email.smtp import SmtpEmailSender
from adapters.export.docx import DocxExporter
from adapters.export.markdown import MarkdownExporter
from adapters.llm.demo import DemoLLM
from adapters.meet.google import GoogleMeetRooms
from adapters.llm.openai_compat import OpenAICompatLLM
from adapters.storage.local import LocalStore
from adapters.storage.minio_store import MinioStore
from adapters.translate.demo import DemoTranslator
from adapters.translate.llm import LLMTranslator
from app.settings import Settings
from core.ports import ASR, LLM, EmailSender, IdentityVerifier, MeetingBot, MinutesExporter, ObjectStore, Translator
from core.prompts import PromptLibrary
from core.services.access import AccessService
from core.services.auth import AuthService
from core.services.invitations import InvitationService
from core.services.orgs import OrgService
from core.services.documents import DocumentService
from core.services.live_pipeline import LivePipeline
from core.services.meetings import MeetingService
from core.services.meet_rooms import MeetRoomService
from core.services.minutes import MinutesService
from core.services.post_meeting import PostMeetingService
from core.services.presence import PresenceRegistry
from core.services.presenter import PresenterService
from core.services.recovery import recover_interrupted
from core.services.translation import TranslationService

log = logging.getLogger(__name__)


def _bot(cfg: dict[str, Any]) -> MeetingBot:
    kind = cfg.get("adapter", "fake")
    if kind == "fake":
        return FakeBot(speed=float(cfg.get("speed", 1.0)), gap_s=float(cfg.get("gap_s", 3.0)))
    if kind == "attendee":
        return AttendeeBot(
            base_url=cfg["base_url"],
            api_key=cfg["api_key"],
            bot_name=cfg.get("bot_name", "MeetMind"),
            poll_interval_s=float(cfg.get("poll_interval_s", 0.5)),
            stable_s=float(cfg.get("stable_s", 1.5)),
            transcription_settings=cfg.get("transcription_settings"),
        )
    raise ValueError(f"unknown bot adapter: {kind}")


def _asr(cfg: dict[str, Any]) -> ASR | None:
    kind = cfg.get("adapter", "none")
    if kind == "none":
        return None
    if kind == "faster_whisper":
        return FasterWhisperASR(
            model=cfg.get("model", "small"),
            device=cfg.get("device", "auto"),
            compute_type=cfg.get("compute_type", "int8"),
        )
    raise ValueError(f"unknown asr adapter: {kind}")


def _llm(cfg: dict[str, Any], prompts: PromptLibrary, model_key: str) -> LLM:
    kind = cfg.get("adapter", "demo")
    if kind == "demo":
        return DemoLLM()
    if kind == "openai_compat":
        return OpenAICompatLLM(
            prompts=prompts,
            base_url=cfg["base_url"],
            model=cfg[model_key],
            api_key=cfg.get("api_key", ""),
            timeout_s=float(cfg.get("timeout_s", 120)),
            max_tokens=cfg.get("max_tokens"),
        )
    raise ValueError(f"unknown llm adapter: {kind}")


def _translator(cfg: dict[str, Any], realtime_llm: LLM) -> Translator:
    kind = cfg.get("adapter", "demo")
    if kind == "demo":
        return DemoTranslator()
    if kind == "llm":
        return LLMTranslator(realtime_llm, model_label=cfg.get("label", "llm"))
    raise ValueError(f"unknown translator adapter: {kind}")


def _store(cfg: dict[str, Any], data_dir: Path) -> ObjectStore:
    kind = cfg.get("adapter", "local")
    if kind == "local":
        return LocalStore(data_dir / "files")
    if kind == "minio":
        return MinioStore(
            endpoint=cfg["endpoint"],
            access_key=cfg["access_key"],
            secret_key=cfg["secret_key"],
            bucket=cfg.get("bucket", "meetmind"),
            secure=bool(cfg.get("secure", False)),
        )
    raise ValueError(f"unknown storage adapter: {kind}")


def _mailer(cfg: dict[str, Any]) -> EmailSender:
    kind = cfg.get("adapter", "console")
    if kind == "console":
        return ConsoleEmailSender()
    if kind == "smtp":
        return SmtpEmailSender(
            host=cfg["host"],
            port=int(cfg.get("port", 587)),
            sender=cfg["sender"],
            sender_name=cfg.get("sender_name", "MeetMind"),
            username=cfg.get("username", ""),
            password=cfg.get("password", ""),
            use_ssl=bool(cfg.get("use_ssl", False)),
        )
    raise ValueError(f"unknown email adapter: {kind}")


@dataclass
class Container:
    settings: Settings
    config: dict[str, Any]
    repo: SqlRepository
    bus: MemoryBus
    presence: PresenceRegistry
    access: AccessService
    translation: TranslationService
    pipeline: LivePipeline
    store: ObjectStore
    mailer: EmailSender
    auth: AuthService
    identity: IdentityVerifier | None
    meet_rooms: MeetRoomService | None
    orgs: OrgService
    meetings: MeetingService
    documents: DocumentService
    presenter: PresenterService
    minutes: MinutesService
    exporters: dict[str, MinutesExporter]
    finalize: Callable[[str], Awaitable[None]]
    release_bots: Callable[[], Awaitable[int]] | None = None
    _tasks: set[asyncio.Task] = field(default_factory=set)

    @property
    def shows_dev_codes(self) -> bool:
        """With the console mailer nothing is delivered, so the sign-in code is shown on screen instead."""
        return isinstance(self.mailer, ConsoleEmailSender)

    def spawn(self, coro) -> None:
        task = asyncio.create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def recover_interrupted(self) -> list[str]:
        return await recover_interrupted(self.repo, self.finalize, self.release_bots)

    async def close(self) -> None:
        await self.pipeline.shutdown()
        for task in list(self._tasks):
            task.cancel()
        await self.repo.dispose()


def build_container(settings: Settings, config: dict[str, Any]) -> Container:
    data_dir = Path(settings.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    prompts = PromptLibrary(settings.prompts_dir)

    repo = SqlRepository(settings.database_url)
    bus = MemoryBus()
    presence = PresenceRegistry()
    access = AccessService(repo)

    bot = _bot(config["bot"])
    realtime_llm = _llm(config["llm"], prompts, "realtime_model")
    report_llm = _llm(config["llm"], prompts, "report_model")

    translator_cfg = config["translator"]
    translation = TranslationService(
        _translator(translator_cfg, realtime_llm),
        repo,
        bus,
        partials=bool(translator_cfg.get("partial", translator_cfg.get("adapter", "demo") != "demo")),
    )
    minutes = MinutesService(repo, report_llm, output_lang=config["minutes"].get("output_lang", "Vietnamese"))
    post_meeting = PostMeetingService(
        repo, bot, _asr(config["asr"]), minutes, bus, auto_minutes=bool(config["minutes"].get("auto", True))
    )
    pipeline = LivePipeline(bot, repo, bus, presence, translation, on_ended=post_meeting.finalize)

    store = _store(config["storage"], data_dir)
    mailer = _mailer(config["email"])
    invitations = InvitationService(repo, mailer)
    identity = (
        GoogleIdentityVerifier(settings.google_client_id, settings.google_allowed_domains) if settings.google_client_id else None
    )
    meet_rooms = (
        MeetRoomService(
            repo,
            access,
            GoogleMeetRooms(
                settings.google_client_id,
                settings.google_client_secret,
                f"{settings.public_api_url.rstrip('/')}/api/google/callback",
                settings.meet_access_type,
            ),
            settings.jwt_secret,
        )
        if settings.google_client_id and settings.google_client_secret
        else None
    )
    email_code = {"on": True, "off": False}.get(settings.email_code.lower(), identity is None)

    return Container(
        settings=settings,
        config=config,
        repo=repo,
        bus=bus,
        presence=presence,
        access=access,
        translation=translation,
        pipeline=pipeline,
        store=store,
        mailer=mailer,
        auth=AuthService(repo, mailer, invitations, email_code_enabled=email_code),
        identity=identity,
        meet_rooms=meet_rooms,
        orgs=OrgService(repo, invitations, settings.app_url),
        meetings=MeetingService(repo, access, pipeline, bus, invitations, settings.app_url),
        documents=DocumentService(
            repo,
            store,
            LibreOfficeProcessor(),
            access,
            bus,
            max_bytes=settings.max_upload_mb * 1024 * 1024,
        ),
        presenter=PresenterService(repo, access, bus),
        minutes=minutes,
        exporters={"docx": DocxExporter(), "md": MarkdownExporter()},
        finalize=post_meeting.finalize,
        release_bots=getattr(bot, "release_orphans", None),
    )
