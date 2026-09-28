# =====================================================================
# Gera com Coqui TTS (XTTS v2) os áudios dos exercícios interativos.
#
# 1) Textos soltos (lista JSON exportada por
#    backend/seed/exportarTextosExercicios.js): mesmo esquema do
#    gerar_audios.py — public/audio/tts/<sha256(texto)>.mp3, voz sorteada
#    pelo hash do texto. Diferente dele, aqui o manifest.json é SOMADO
#    (hashes existentes + novos), para não apagar os áudios dos outros
#    módulos do site.
# 2) Diálogos (--dialogo arquivo.json): várias falas com vozes FIXAS por
#    personagem, juntadas num único MP3 (ex.: áudio da prova DELF).
#    Formato: {"saida": "public/audio/exercicios/x.mp3",
#              "vozes": {"jornalista": "Ana Florence", ...},
#              "falas": [{"voz": "jornalista", "texto": "..."}, ...]}
#
# Uso:
#   .venv-tts/Scripts/python.exe scripts_tts/gerar_audios_exercicios.py <textos.json> [--dialogo d.json ...]
# =====================================================================
import json
import sys
import wave
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gerar_audios import (  # noqa: E402  (reaproveita modelo, vozes e conversão)
    MODEL_NAME, IDIOMA, ROOT, OUT_DIR, sha256_hex, escolher_voz, wav_para_mp3, TTS,
)

PAUSA_ENTRE_FALAS_S = 0.6


def carregar_tts():
    return TTS(model_name=MODEL_NAME, progress_bar=False)


def gerar_textos(tts, textos):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pendentes = [t for t in textos if not (OUT_DIR / f"{sha256_hex(t)}.mp3").exists()]
    print(f"{len(textos)} textos, {len(pendentes)} a gerar.", flush=True)
    tmp_wav = ROOT / "scripts_tts" / "_tmp_ex.wav"
    for i, texto in enumerate(pendentes, 1):
        voz = escolher_voz(texto)
        tts.tts_to_file(text=texto, speaker=voz, language=IDIOMA, file_path=str(tmp_wav))
        (OUT_DIR / f"{sha256_hex(texto)}.mp3").write_bytes(wav_para_mp3(tmp_wav))
        print(f"[{i}/{len(pendentes)}] ({voz}) {texto[:60]}", flush=True)
    tmp_wav.unlink(missing_ok=True)

    manifest_path = OUT_DIR / "manifest.json"
    existentes = set(json.loads(manifest_path.read_text(encoding="utf-8"))) if manifest_path.exists() else set()
    novos = {sha256_hex(t) for t in textos}
    manifest_path.write_text(json.dumps(sorted(existentes | novos)), encoding="utf-8")
    print(f"Manifest: {len(existentes)} existentes + {len(novos - existentes)} novos.", flush=True)


def gerar_dialogo(tts, caminho):
    d = json.loads(Path(caminho).read_text(encoding="utf-8"))
    destino = ROOT / d["saida"]
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = ROOT / "scripts_tts" / "_tmp_fala.wav"
    pcm, taxa, canais, largura = b"", None, None, None
    for i, fala in enumerate(d["falas"], 1):
        voz = d["vozes"][fala["voz"]]
        tts.tts_to_file(text=fala["texto"], speaker=voz, language=IDIOMA, file_path=str(tmp))
        with wave.open(str(tmp), "rb") as w:
            taxa, canais, largura = w.getframerate(), w.getnchannels(), w.getsampwidth()
            pcm += w.readframes(w.getnframes())
        pcm += b"\x00" * int(taxa * PAUSA_ENTRE_FALAS_S) * canais * largura
        print(f"  fala {i}/{len(d['falas'])} ({voz})", flush=True)
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(canais); w.setsampwidth(largura); w.setframerate(taxa)
        w.writeframes(pcm)
    destino.write_bytes(wav_para_mp3(tmp))
    tmp.unlink(missing_ok=True)
    print(f"Diálogo salvo em {destino}", flush=True)


def main():
    args = sys.argv[1:]
    if not args:
        print("Uso: gerar_audios_exercicios.py <textos.json> [--dialogo d.json ...]")
        sys.exit(1)
    dialogos = [args[i + 1] for i, a in enumerate(args) if a == "--dialogo"]
    textos_json = args[0]
    tts = carregar_tts()
    for dlg in dialogos:
        gerar_dialogo(tts, dlg)
    gerar_textos(tts, json.loads(Path(textos_json).read_text(encoding="utf-8")))


if __name__ == "__main__":
    main()
