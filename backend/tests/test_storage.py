import io

import pytest
from fastapi import HTTPException, UploadFile

from backend.services.storage import VoiceStorage


@pytest.mark.asyncio
async def test_invalid_audio_mime_is_rejected():
    upload = UploadFile(filename="bad.txt", file=io.BytesIO(b"not audio"), headers={"content-type": "text/plain"})
    with pytest.raises(HTTPException) as exc:
        await VoiceStorage().upload_voice_message(upload)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_empty_audio_is_rejected():
    upload = UploadFile(filename="empty.webm", file=io.BytesIO(b""), headers={"content-type": "audio/webm"})
    with pytest.raises(HTTPException) as exc:
        await VoiceStorage().upload_voice_message(upload)
    assert exc.value.status_code == 400
