from __future__ import annotations

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["realtime"])
logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)
        logger.info("ws_connected total=%d", len(self.active))

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)
        logger.info("ws_disconnected total=%d", len(self.active))

    async def broadcast(self, event_type: str, payload: dict) -> None:
        if not self.active:
            return
        msg = json.dumps({"event_type": event_type, **payload})
        dead: list[WebSocket] = []
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


connection_manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await connection_manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect(ws)
