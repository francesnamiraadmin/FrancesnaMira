# =====================================================================
# Gera os áudios estáticos usados no site (Questões Interativas + questões
# tipo "escuta") via Coqui TTS (modelo tts_models/fr/css10/vits, licença
# BSD-3-Clause). Lê a lista de textos únicos exportada por
# backend/seed/exportarTextosAudio.js, sintetiza cada um e salva como MP3
# em public/audio/tts/<sha256(texto)>.mp3 — o mesmo hash é recalculado no
# navegador (js/audioFrances.js) para localizar o arquivo certo. Ao final,
# escreve public/audio/tts/manifest.json com a lista de hashes disponíveis.
#
# Idempotente: pula textos cujo mp3 já existe.
#
# Uso:
#   .venv-tts/Scripts/python.exe scripts_tts/gerar_audios.py <textos.json>
# =====================================================================
import hashlib
import io
import json
import sys
import wave
from pathlib import Path

import lameenc
from TTS.api import TTS

MODEL_NAME = "tts_models/fr/css10/vits"
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "audio" / "tts"


def sha256_hex(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def wav_para_mp3(caminho_wav: Path) -> bytes:
    with wave.open(str(caminho_wav), "rb") as w:
        canais = w.getnchannels()
        taxa = w.getframerate()
        largura = w.getsampwidth()
        pcm = w.readframes(w.getnframes())

    if largura != 2:
        raise ValueError(f"Esperava PCM 16-bit, recebi sampwidth={largura}")

    encoder = lameenc.Encoder()
    encoder.set_bit_rate(64)
    encoder.set_in_sample_rate(taxa)
    encoder.set_channels(canais)
    encoder.set_quality(2)
    mp3_bytes = encoder.encode(pcm)
    mp3_bytes += encoder.flush()
    return mp3_bytes


def main():
    if len(sys.argv) < 2:
        print("Uso: gerar_audios.py <textos.json>")
        sys.exit(1)

    textos = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    pendentes = [t for t in textos if not (OUT_DIR / f"{sha256_hex(t)}.mp3").exists()]
    print(f"{len(textos)} textos no total, {len(pendentes)} pendentes de geração.")

    if pendentes:
        tts = TTS(model_name=MODEL_NAME, progress_bar=False)
        tmp_wav = ROOT / "scripts_tts" / "_tmp.wav"
        for i, texto in enumerate(pendentes, 1):
            h = sha256_hex(texto)
            destino = OUT_DIR / f"{h}.mp3"
            tts.tts_to_file(text=texto, file_path=str(tmp_wav))
            mp3_bytes = wav_para_mp3(tmp_wav)
            destino.write_bytes(mp3_bytes)
            print(f"[{i}/{len(pendentes)}] {h[:12]}  {texto[:60]}")
        tmp_wav.unlink(missing_ok=True)

    manifest = sorted(sha256_hex(t) for t in textos)
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print(f"Manifest salvo com {len(manifest)} hashes em {OUT_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main()
