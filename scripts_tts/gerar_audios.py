# =====================================================================
# Gera os áudios estáticos usados no site (Questões Interativas + questões
# tipo "escuta") via Coqui TTS, modelo tts_models/multilingual/multi-dataset/
# xtts_v2 (licença Coqui Public Model License — CPML). Lê a lista de textos
# únicos exportada por backend/seed/exportarTextosAudio.js, sintetiza cada
# um com uma voz sorteada (de forma determinística, por hash do texto) entre
# as 58 vozes embutidas no modelo — 30 femininas e 28 masculinas, de timbres
# variados — e salva como MP3 em public/audio/tts/<sha256(texto)>.mp3. O
# mesmo hash é recalculado no navegador (js/audioFrances.js) pra localizar o
# arquivo certo; a voz não faz parte do hash, então um texto sempre usa a
# mesma voz entre gerações (reprodutível), mas textos diferentes calham em
# vozes diferentes. Ao final, escreve public/audio/tts/manifest.json com a
# lista de hashes disponíveis.
#
# Idempotente: pula textos cujo mp3 já existe. Use --forcar pra regenerar
# tudo (ex.: ao trocar de modelo/vozes).
#
# Uso:
#   .venv-tts/Scripts/python.exe scripts_tts/gerar_audios.py <textos.json> [--forcar]
# =====================================================================
import hashlib
import sys
import wave
from pathlib import Path

# No Windows, stdout/stderr redirecionado pra arquivo às vezes cai pro codepage
# cp1252 em vez de UTF-8 — sem isso, imprimir nomes de voz com acentos (ex.:
# "Mataracı") derruba o processo no meio da geração.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import lameenc
from TTS.api import TTS

MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"
IDIOMA = "fr"
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "audio" / "tts"

# As 58 vozes embutidas no XTTS v2 (documentação Coqui), separadas por
# timbre percebido só pra registro — a escolha em si é apenas determinística
# por hash, sem lógica de gênero no código.
VOZES_FEMININAS = [
    "Claribel Dervla", "Daisy Studious", "Gracie Wise", "Tammie Ema", "Alison Dietlinde",
    "Ana Florence", "Annmarie Nele", "Asya Anara", "Brenda Stern", "Gitta Nikolina",
    "Henriette Usha", "Sofia Hellen", "Tammy Grit", "Tanja Adelina", "Vjollca Johnnie",
    "Nova Hogarth", "Maja Ruoho", "Uta Obando", "Lidiya Szekeres", "Chandra MacFarland",
    "Szofi Granger", "Camilla Holmström", "Lilya Stainthorpe", "Zofija Kendrick", "Narelle Moon",
    "Barbora MacLean", "Alexandra Hisakawa", "Alma María", "Rosemary Okafor", "Ige Behringer",
]
VOZES_MASCULINAS = [
    "Andrew Chipper", "Badr Odhiambo", "Dionisio Schuyler", "Royston Min", "Viktor Eka",
    "Abrahan Mack", "Adde Michal", "Baldur Sanjin", "Craig Gutsy", "Damien Black",
    "Gilberto Mathias", "Ilkin Urbano", "Kazuhiko Atallah", "Ludvig Milivoj", "Suad Qasim",
    "Torcull Diarmuid", "Viktor Menelaos", "Zacharie Aimilios", "Filip Traverse", "Damjan Chapman",
    "Wulf Carlevaro", "Aaron Dreschner", "Kumar Dahl", "Eugenio Mataracı", "Ferran Simen",
    "Xavier Hayasaka", "Luis Moray", "Marcos Rudaski",
]
VOZES = VOZES_FEMININAS + VOZES_MASCULINAS


def sha256_hex(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def escolher_voz(texto: str) -> str:
    h = sha256_hex(texto)
    idx = int(h, 16) % len(VOZES)
    return VOZES[idx]


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
        print("Uso: gerar_audios.py <textos.json> [--forcar]")
        sys.exit(1)

    import json
    textos = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    forcar = "--forcar" in sys.argv[2:]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    pendentes = textos if forcar else [
        t for t in textos if not (OUT_DIR / f"{sha256_hex(t)}.mp3").exists()
    ]
    print(f"{len(textos)} textos no total, {len(pendentes)} pendentes de geração.")

    if pendentes:
        tts = TTS(model_name=MODEL_NAME, progress_bar=False)
        tmp_wav = ROOT / "scripts_tts" / "_tmp.wav"
        for i, texto in enumerate(pendentes, 1):
            h = sha256_hex(texto)
            voz = escolher_voz(texto)
            destino = OUT_DIR / f"{h}.mp3"
            tts.tts_to_file(text=texto, speaker=voz, language=IDIOMA, file_path=str(tmp_wav))
            mp3_bytes = wav_para_mp3(tmp_wav)
            destino.write_bytes(mp3_bytes)
            print(f"[{i}/{len(pendentes)}] {h[:12]}  ({voz})  {texto[:50]}")
        tmp_wav.unlink(missing_ok=True)

    manifest = sorted(sha256_hex(t) for t in textos)
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print(f"Manifest salvo com {len(manifest)} hashes em {OUT_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main()
