"""WebSocket gateway: one socket per browser tab per meeting.

Server -> client: everything published on the meeting topic (filtered per connection) plus `hello`.
Client -> server: set_lang, presenter.claim|release|grant|move.
"""
from __future__ import annotations

import asyncio
import logging
import uuid

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder

from app.container import Container
from app.security import decode_token
from core.errors import DomainError
from core.services.access import Actor
from core.services.meetings import validate_lang
from core.services.presence import Connection
from core.services.topics import meeting_topic

log = logging.getLogger(__name__)
router = APIRouter()


async def _publish_presence(c: Container, meeting_id: str) -> None:
    await c.bus.publish(meeting_topic(meeting_id), {"type": "presence", "online": c.presence.online(meeting_id)})


async def _pump(ws: WebSocket, c: Container, sub, meeting_id: str, conn_id: str, user_id: str) -> None:
    """Forward bus events to this socket, dropping the ones meant for other readers."""
    while True:
        event = await sub.get()
        try:
            kind = event.get("type")
            if kind == "segment.translation" and event.get("lang") != c.presence.lang_of(conn_id):
                continue
            if kind == "presenter.request":
                actor = await c.access.member(meeting_id, user_id)
                presenter = c.presenter.state(meeting_id)
                if not (actor.can_manage or (presenter and presenter["user_id"] == user_id)):
                    continue
            await ws.send_json(jsonable_encoder(event))  # events may carry datetimes
        except (WebSocketDisconnect, RuntimeError):
            return  # the socket is gone
        except Exception:
            log.exception("could not deliver %s to a client", event.get("type"))  # keep serving the rest


async def _handle(c: Container, meeting_id: str, conn_id: str, actor: Actor, msg: dict) -> None:
    kind = msg.get("type")
    if kind == "set_lang":
        lang = validate_lang(msg.get("lang"))
        c.presence.set_lang(conn_id, lang)
        await c.repo.update_participant(meeting_id, actor.user_id, display_lang=lang)
        if lang:
            c.spawn(c.translation.backfill(meeting_id, lang))
    elif kind == "presenter.claim":
        await c.presenter.claim(meeting_id, actor)
    elif kind == "presenter.release":
        await c.presenter.release(meeting_id, actor)
    elif kind == "presenter.grant":
        await c.presenter.grant(meeting_id, actor, str(msg.get("user_id", "")))
    elif kind == "presenter.move":
        await c.presenter.move(meeting_id, actor, msg.get("position") or {})


@router.websocket("/ws/meetings/{meeting_id}")
async def meeting_socket(ws: WebSocket, meeting_id: str, token: str = Query("")) -> None:
    c: Container = ws.app.state.container
    try:
        user_id = decode_token(token, c.settings.jwt_secret)
        actor = await c.access.member(meeting_id, user_id)
    except (jwt.PyJWTError, DomainError):
        await ws.close(code=4401)
        return
    await ws.accept()

    mine = await c.repo.get_participant(meeting_id, user_id)
    conn_id = uuid.uuid4().hex
    c.presence.join(Connection(conn_id, meeting_id, user_id, actor.name, mine.display_lang if mine else None))
    sub = c.bus.subscribe(meeting_topic(meeting_id))
    pump = asyncio.create_task(_pump(ws, c, sub, meeting_id, conn_id, user_id))
    try:
        meeting = await c.access.meeting(meeting_id)
        await ws.send_json(
            {
                "type": "hello",
                "status": meeting.status,
                "presenter": c.presenter.state(meeting_id),
                "online": c.presence.online(meeting_id),
            }
        )
        await _publish_presence(c, meeting_id)
        if mine and mine.display_lang:
            c.spawn(c.translation.backfill(meeting_id, mine.display_lang))
        while True:
            msg = await ws.receive_json()
            try:
                actor = await c.access.member(meeting_id, user_id)  # role may have changed meanwhile
                await _handle(c, meeting_id, conn_id, actor, msg)
            except DomainError as exc:
                await ws.send_json({"type": "error", "message": str(exc)})
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("socket error")
    finally:
        pump.cancel()
        sub.close()
        c.presence.leave(conn_id)
        if not c.presence.has_user(meeting_id, user_id):
            await c.presenter.on_disconnect(meeting_id, user_id)
        await _publish_presence(c, meeting_id)
