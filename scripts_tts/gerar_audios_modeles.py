# =====================================================================
# Áudios Coqui TTS (XTTS v2) dos modelos do Ambiente de Produção (app "Modèles TCF").
# Entrada: lista de chaves "A|texto" / "B|texto" (backend/seed/exportarTextosModeles.js).
#   A = candidat(e) e textos lidos · B = examinateur (vozes fixas, como no script).
# Saída: public/audio/modeles/<sha256(chave)>.mp3 + manifest.json (lista dos hashes), que o
# app consulta antes de cair na voz do navegador.
#
# Cada frase é conferida com Whisper (scripts_tts/verificacao.py): se a transcrição não bate,
# sintetiza de novo (até 5 vezes) e fica a melhor. Falas de várias frases (réplicas inteiras
# do diálogo T2) são montadas juntando os áudios das frases, com uma pausa curta — não são
# sintetizadas de novo. Idempotente: pula o que já existe. Vários processos podem rodar juntos
# (cada item é travado por um arquivo .lock).
#
# Uso: .venv-tts/Scripts/python.exe scripts_tts/gerar_audios_modeles.py scripts_tts/textos_modeles.json [--sem-verificar]
# =====================================================================
import hashlib
import json
import os
import re
import sys
import time
import wave
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gerar_audios import MODEL_NAME, IDIOMA, ROOT, wav_para_mp3, TTS  # noqa: E402

VOZES = {"A": "Ana Florence", "B": "Viktor Eka"}
PASTA = ROOT / "public" / "audio" / "modeles"
LIMIAR_OK = 0.80
TENTATIVAS = 5
PAUSA_FRASES_S = 0.35
PID = os.getpid()
TMP = ROOT / "scripts_tts" / f"_tmp_mod_{PID}.wav"


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def dividir_frases(texto):
    """IDÊNTICA a dividirFrases do app (public/js/producaoApp.js)."""
    saida = []
    for par in re.split(r"\n+", str(texto or "")):
        frases = []
        for p in re.findall(r"[^.!?…]+(?:[.!?…]+[»\")\]]*)?", par.strip()):
            p = p.strip()
            if not p:
                continue
            if frases and (re.match(r"^[a-zà-ÿ,;:)»]", p) or not re.search(r"[A-Za-zÀ-ÿ]", p)):
                frases[-1] += " " + p
            else:
                frases.append(p)
        saida += frases
    return saida


def pegar(lock):
    try:
        if lock.exists() and time.time() - lock.stat().st_mtime > 30 * 60:
            lock.unlink(missing_ok=True)
        os.close(os.open(str(lock), os.O_CREAT | os.O_EXCL))
        return True
    except FileExistsError:
        return False


def ler_pcm(caminho):
    with wave.open(str(caminho), "rb") as w:
        return w.readframes(w.getnframes()), w.getframerate(), w.getnchannels(), w.getsampwidth()


def gravar_mp3(destino, pcm, taxa, canais, largura):
    with wave.open(str(TMP), "wb") as w:
        w.setnchannels(canais); w.setsampwidth(largura); w.setframerate(taxa); w.writeframes(pcm)
    destino.write_bytes(wav_para_mp3(TMP))


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__ or "uso: gerar_audios_modeles.py textos.json [--sem-verificar]")
        sys.exit(1)
    verificar = "--sem-verificar" not in args
    chaves = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    PASTA.mkdir(parents=True, exist_ok=True)

    # Frases soltas primeiro; falas de várias frases depois (montadas a partir delas).
    simples, compostas = [], []
    for c in chaves:
        voz, texto = c.split("|", 1)
        (simples if len(dividir_frases(texto)) <= 1 else compostas).append((voz, texto))
    frases_das_compostas = {(v, f) for v, t in compostas for f in dividir_frases(t)}
    simples_set = set(simples) | frases_das_compostas
    pend = [(v, t) for v, t in sorted(simples_set, key=lambda x: (x[0], x[1])) if not (PASTA / f"{sha(v + '|' + t.strip())}.mp3").exists()]
    print(f"{len(chaves)} falas · {len(simples_set)} frases ({len(pend)} a gerar) · {len(compostas)} falas compostas", flush=True)

    tts = TTS(model_name=MODEL_NAME, progress_bar=False) if pend else None
    whisper = None
    if pend and verificar:
        from verificacao import Whisper, parecido  # noqa: E402
        import numpy as np, librosa  # noqa: E401
        whisper = Whisper()

    feitos = 0
    for voz, texto in pend:
        texto = texto.strip()
        h = sha(voz + "|" + texto)
        destino, lock = PASTA / f"{h}.mp3", PASTA / f"{h}.lock"
        if destino.exists() or not pegar(lock):
            continue
        try:
            melhor = None
            for t in range(1, TENTATIVAS + 1):
                tts.tts_to_file(text=re.sub(r"\.+$", "", texto), speaker=VOZES[voz], language=IDIOMA, file_path=str(TMP), split_sentences=False)
                pcm, taxa, canais, largura = ler_pcm(TMP)
                nota = 1.0
                if whisper:
                    y = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
                    ouvido = whisper.transcrever(librosa.resample(y, orig_sr=taxa, target_sr=16000))
                    nota = parecido(texto, ouvido)
                if melhor is None or nota > melhor[0]:
                    melhor = (nota, pcm, taxa, canais, largura)
                if nota >= LIMIAR_OK:
                    break
            nota, pcm, taxa, canais, largura = melhor
            gravar_mp3(destino, pcm, taxa, canais, largura)
            feitos += 1
            if t > 1 or nota < LIMIAR_OK:
                print(f"  {voz} {t} tentativa(s), nota {nota:.2f} | {texto[:70]}", flush=True)
            if feitos % 25 == 0:
                print(f"{time.strftime('%H:%M:%S')} [{PID}] {feitos}/{len(pend)} frases", flush=True)
        finally:
            lock.unlink(missing_ok=True)

    # Falas compostas: junta os mp3 das frases (decodificados) com uma pausa curta.
    if compostas:
        import librosa
        import numpy as np
        montadas = 0
        for voz, texto in compostas:
            texto = texto.strip()
            destino = PASTA / f"{sha(voz + '|' + texto)}.mp3"
            if destino.exists():
                continue
            partes = [PASTA / f"{sha(voz + '|' + f.strip())}.mp3" for f in dividir_frases(texto)]
            if not all(p.exists() for p in partes):
                continue
            ys = [librosa.load(str(p), sr=24000, mono=True)[0] for p in partes]
            pausa = np.zeros(int(24000 * PAUSA_FRASES_S), dtype=np.float32)
            y = np.concatenate([x for par in zip(ys, [pausa] * len(ys)) for x in par][:-1])
            pcm = (np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes()
            gravar_mp3(destino, pcm, 24000, 1, 2)
            montadas += 1
        print(f"{montadas} falas compostas montadas", flush=True)

    # Manifest = todos os mp3 presentes (vários processos podem ter gerado).
    manifest = sorted(p.stem for p in PASTA.glob("*.mp3"))
    trava = PASTA / "manifest.lock"
    while not pegar(trava):
        time.sleep(1)
    try:
        (PASTA / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    finally:
        trava.unlink(missing_ok=True)
    TMP.unlink(missing_ok=True)
    print(f"manifest: {len(manifest)} áudios · fim", flush=True)


if __name__ == "__main__":
    main()
