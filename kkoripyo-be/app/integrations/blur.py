"""블러 서버 클라이언트 (services/blur, Florence-2로 사진 속 글자 영역을 블러).

요청: POST {BLUR_SERVER_URL}/blur/urls  {"images": [{"image_id", "image_url"}]}  (최대 4장)
응답: {"images": [{"image_id", "image_url", "blurred_image": "data:image/jpeg;base64,...", "error"}]}
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import secrets
import time
from collections import OrderedDict

import httpx

from app.core.config import get_settings

MAX_IMAGES = 4

# 블러된 사진은 화면 이벤트에 통째로 넣기엔 크다(수백 KB~1MB 이상).
# 서버 메모리에 잠시 보관하고 화면에는 주소만 보낸다.
KEEP_SECONDS = 3 * 60 * 60
KEEP_MAX = 300
_kept: OrderedDict[str, tuple[float, bytes]] = OrderedDict()


def keep_image(data_url: str | None) -> str | None:
    """'data:image/jpeg;base64,...'를 보관하고 꺼낼 열쇠를 돌려준다. 형식이 틀리면 None."""
    if not data_url or not data_url.startswith("data:image/jpeg;base64,"):
        return None
    try:
        data = base64.b64decode(data_url.split(",", 1)[1], validate=True)
    except (binascii.Error, ValueError):
        return None
    now = time.monotonic()
    while _kept and (len(_kept) >= KEEP_MAX or next(iter(_kept.values()))[0] < now):
        _kept.popitem(last=False)
    key = secrets.token_urlsafe(18)
    _kept[key] = (now + KEEP_SECONDS, data)
    return key


def kept_image(key: str) -> bytes | None:
    item = _kept.get(key)
    if not item or item[0] < time.monotonic():
        _kept.pop(key, None)
        return None
    return item[1]


class BlurClient:
    def __init__(
        self,
        base_url: str | None = None,
        *,
        timeout: float | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        settings = get_settings()
        url = base_url if base_url is not None else settings.blur_server_url
        self.enabled = bool(url)
        self.timeout = timeout if timeout is not None else settings.blur_timeout
        self._http = httpx.AsyncClient(base_url=url or "http://blur.invalid", transport=transport)

    async def __aenter__(self) -> BlurClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self._http.aclose()

    async def blur(self, images: list[dict]) -> list[dict]:
        """[{image_id, image_url}] → [{image_id, image_url, blurred_image, error}].

        서버가 꺼져 있거나 timeout초 안에 끝나지 않아도 예외를 던지지 않고 이미지마다 error를 남긴다.
        """
        images = images[:MAX_IMAGES]
        if not images:
            return []
        if not self.enabled:
            return [{**i, "blurred_image": None, "error": "blur_disabled"} for i in images]
        # 순위대로 한 장씩 보내, 시간 안에 끝난 앞 순위 사진은 살리고 나머지만 건너뛴다
        loop = asyncio.get_running_loop()
        deadline = loop.time() + self.timeout
        out = []
        for i in images:
            try:
                out.append(await asyncio.wait_for(self._one(i), max(0, deadline - loop.time())))
            except TimeoutError:
                out.append({**i, "blurred_image": None, "error": "blur_timeout"})
        return out

    async def _one(self, image: dict) -> dict:
        try:
            # 전체 시간 상한은 blur()의 asyncio.wait가 건다
            res = await self._http.post("/blur/urls", json={"images": [image]}, timeout=None)
            res.raise_for_status()
            rows = res.json().get("images") or []
        except (httpx.HTTPError, ValueError) as e:
            return {
                **image,
                "blurred_image": None,
                "error": f"blur_unavailable: {type(e).__name__}",
            }
        row = next((r for r in rows if r.get("image_id") == image["image_id"]), None)
        if row is None:
            return {**image, "blurred_image": None, "error": "no_result"}
        return {**image, "blurred_image": row.get("blurred_image"), "error": row.get("error")}


def make_blur_client() -> BlurClient:
    """테스트에서 가짜 클라이언트로 바꿔 끼울 수 있게 함수로 둔다."""
    return BlurClient()
