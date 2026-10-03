# =====================================================================
# Corrige os áudios curtos (1 a 3 palavras) dos exercícios que o XTTS v2 « alucinou »: com uma
# palavra só, o modelo às vezes fala a palavra e depois continua com sons inventados (ex.:
# « temps » com 2,6 s, « grands » com 15 s) ou troca a palavra.
#
# Para cada texto suspeito (duração muito acima do esperado), gera vários candidatos e fica o melhor:
#  - « palavra, palavra, palavra. » → a 1ª ocorrência (com contexto, o modelo pronuncia melhor);
#  - « Écoutez bien : palavra. » → a última palavra (frase-suporte);
#  - « palavra. » sozinha, cortada na primeira pausa (a alucinação vem depois da palavra).
# Cada recorte é conferido com o Whisper ouvindo o recorte 3 vezes seguidas (clipes de meio
# segundo isolados confundem o Whisper) e comparado com uma chave fonética do francês, que trata
# homófonos como iguais (temps = tant, six = sis…). Duração também conta.
# O MP3 é regravado no mesmo lugar (public/audio/tts/<sha256(texto)>.mp3): o site não muda.
#
# Uso:
#   .venv-tts/Scripts/python.exe scripts_tts/corrigir_audios_curtos.py <textos.json> [--todos] [--so "temps,ton"]
#   (textos.json: a lista de backend/seed/exportarTextosExercicios.js)
# =====================================================================
import difflib
import json
import re
import sys
import unicodedata
import wave
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
import librosa  # noqa: E402
from gerar_audios import MODEL_NAME, ROOT, OUT_DIR, sha256_hex, escolher_voz, wav_para_mp3, TTS, VOZES  # noqa: E402
from verificacao import Whisper  # noqa: E402

TMP = ROOT / "scripts_tts" / "_tmp_curto.wav"
MAX_PALAVRAS = 3
LIMIAR = 0.75


def pedacos(texto):
    """Palavras « faladas »: separa por espaço e hífen (quarante-cinq = 2)."""
    return [p for p in re.split(r"[\s\-–/]+", re.sub(r"[.…!?,;:«»()]", " ", texto)) if p]


def limite_s(texto):
    return 0.7 + 0.5 * max(1, len(pedacos(texto)))


def duracao_mp3(caminho):
    return caminho.stat().st_size / 8000  # 64 kbps


def fonetica(s):
    """Chave fonética grosseira do francês: homófonos ficam iguais (temps/tant, six/sis, ton/thon)."""
    s = s.lower().replace("’", "'")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z' ]+", " ", s)
    pal = []
    for w in s.split():
        w = w.strip("'")
        if not w:
            continue
        # consoantes finais mudas; nas palavras curtas (le/les/des) só a consoante, para não sumir a vogal
        w = re.sub(r"(?<=.)(ps|ts|ds|s|x|t|d|p|z|e|es|ent)$", "", w) if len(w) > 3 else re.sub(r"(?<=..)[sxtdpz]$", "", w)
        for a, b in [("ph", "f"), ("qu", "k"), ("ch", "S"), ("gn", "N"), ("eau", "o"), ("au", "o"), ("ou", "U"),
                     ("ain", "I"), ("ein", "I"), ("in", "I"), ("im", "I"), ("un", "I"), ("yn", "I"),
                     ("an", "A"), ("am", "A"), ("en", "A"), ("em", "A"), ("on", "O"), ("om", "O"),
                     ("ai", "e"), ("ei", "e"), ("ez", "e"), ("er", "e"), ("et", "e"), ("ce", "se"), ("ci", "si"),
                     ("c", "k"), ("x", "s"), ("ge", "Je"), ("gi", "Ji"), ("j", "J"), ("h", ""), ("y", "i"), ("th", "t")]:
            w = w.replace(a, b)
        w = re.sub(r"(.)\1+", r"\1", w)
        pal.append(w)
    return " ".join(pal)


def nota(texto, ouvido):
    """Compara o que o Whisper ouviu (o recorte tocado 3 vezes) com o texto 3 vezes e 1 vez:
    às vezes ele transcreve a palavra uma vez só, e isso não é erro do áudio."""
    o = fonetica(ouvido).split()
    melhor = 0
    for vezes in (3, 1):
        e = fonetica(" ".join([texto] * vezes)).split()
        letras = difflib.SequenceMatcher(None, " ".join(e), " ".join(o)).ratio()
        pals = difflib.SequenceMatcher(None, e, o).ratio()
        melhor = max(melhor, (letras + pals) / 2)
    return melhor


def trechos(y, sr, top_db=32, pausa=0.2):
    t = librosa.effects.split(y, top_db=top_db)
    out = []
    for a, b in t:
        if out and (a - out[-1][1]) / sr < pausa:
            out[-1][1] = b
        else:
            out.append([a, b])
    return out


def recorte(y, sr, qual, pausa=0.2):
    s = trechos(y, sr, pausa=pausa)
    if not s:
        return None
    a, b = s[qual] if -len(s) <= qual < len(s) else s[0]
    pad = int(0.05 * sr)
    return y[max(0, a - pad):min(len(y), b + pad)]


def gravar(destino, y, sr):
    y = librosa.util.normalize(y) * 0.9
    fade = int(0.02 * sr)
    if len(y) > 2 * fade:
        y[:fade] *= np.linspace(0, 1, fade); y[-fade:] *= np.linspace(1, 0, fade)
    pcm = (np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes()
    with wave.open(str(TMP), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm)
    destino.write_bytes(wav_para_mp3(TMP))


def main():
    args = sys.argv[1:]
    if not args:
        print("uso: corrigir_audios_curtos.py textos.json [--todos] [--so 'a,b']")
        sys.exit(1)
    textos = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    so = set(t.strip() for t in args[args.index("--so") + 1].split(",")) if "--so" in args else None
    if "--so-arquivo" in args:
        so = set(json.loads(Path(args[args.index("--so-arquivo") + 1]).read_text(encoding="utf-8")))
    alvo = []
    for t in textos:
        if so is not None and t not in so:
            continue
        if len(t.split()) > MAX_PALAVRAS:
            continue
        mp3 = OUT_DIR / f"{sha256_hex(t)}.mp3"
        if so is None and "--todos" not in args and mp3.exists() and duracao_mp3(mp3) <= limite_s(t):
            continue
        alvo.append(t)
    print(f"{len(alvo)} áudio(s) curto(s) para corrigir", flush=True)
    if not alvo:
        return

    tts = TTS(model_name=MODEL_NAME, progress_bar=False)
    whisper = Whisper()

    def ouvir3(c, sr):
        p = np.zeros(int(0.5 * sr), dtype=np.float32)
        return whisper.transcrever(librosa.resample(np.concatenate([c, p, c, p, c]), orig_sr=sr, target_sr=16000))

    relatorio = []
    for i, texto in enumerate(alvo, 1):
        # « ne...pas » se fala « ne pas »: reticências e barras viram espaço (senão o corte para na pausa)
        base = re.sub(r"\s+", " ", re.sub(r"(\.\.\.|…|/)", " ", re.sub(r"[.!?…]+$", "", texto))).strip()
        pausa = 0.2 if len(pedacos(texto)) <= 1 else 0.45
        voz0 = escolher_voz(texto)
        modos = [(f"{base}, {base}, {base}.", 0), (f"Écoutez bien : {base}.", -1), (f"{base}.", 0)]
        melhor = None
        for rodada in range(2):
            voz = voz0 if rodada == 0 else VOZES[(VOZES.index(voz0) + 7) % len(VOZES)]
            for falar, qual in modos:
                tts.tts_to_file(text=falar, speaker=voz, language="fr", file_path=str(TMP), split_sentences=False, temperature=0.3, repetition_penalty=10.0)
                y, sr = librosa.load(str(TMP), sr=None, mono=True)
                c = recorte(y, sr, qual, pausa)
                if c is None or len(c) < 0.12 * sr:
                    continue
                dur = len(c) / sr
                ouvido = ouvir3(c, sr)
                n = nota(texto, ouvido)
                passou = n >= LIMIAR and dur <= limite_s(texto)
                chave = (passou, round(n, 2), -dur)
                if melhor is None or chave > melhor[:3]:
                    melhor = (passou, round(n, 2), -dur, c, sr, voz, ouvido, falar)
                if passou and n >= 0.9:
                    break  # bom o bastante: não precisa dos outros modos
            if melhor and melhor[0] and melhor[1] >= 0.85:
                break
        if not melhor:
            print(f"[{i}/{len(alvo)}] !!  {texto!r}: nenhum candidato", flush=True)
            continue
        passou, n, mdur, c, sr, voz, ouvido, falar = melhor
        destino = OUT_DIR / f"{sha256_hex(texto)}.mp3"
        antes = duracao_mp3(destino) if destino.exists() else 0
        # nenhum candidato passou: só troca o arquivo se o melhor estiver dentro da duração e perto
        # do limite de nota; senão fica o áudio atual (melhor não mexer do que gravar algo errado)
        if not passou and (-mdur > limite_s(texto) or n < LIMIAR - 0.15):
            relatorio.append({"texto": texto, "antes_s": round(antes, 1), "depois_s": None, "nota": n, "ouvido_x3": ouvido, "ok": False, "mantido": True})
            print(f"[{i}/{len(alvo)}] ==  {texto!r}: nenhum candidato bom (melhor nota {n}, {-mdur:.2f}s): mantido o áudio atual", flush=True)
            continue
        gravar(destino, c, sr)
        relatorio.append({"texto": texto, "antes_s": round(antes, 1), "depois_s": round(-mdur, 2), "nota": n, "ouvido_x3": ouvido, "ok": passou, "voz": voz, "modo": falar})
        print(f"[{i}/{len(alvo)}] {'OK ' if passou else '?? '} {texto!r}: {antes:.1f}s -> {-mdur:.2f}s · nota {n} · ouviu {ouvido!r}", flush=True)
    TMP.unlink(missing_ok=True)
    (ROOT / "scripts_tts" / "relatorio_curtos.json").write_text(json.dumps(relatorio, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"pronto: {sum(r['ok'] for r in relatorio)}/{len(relatorio)} conferidos", flush=True)


if __name__ == "__main__":
    main()
