# =====================================================================
# Verificação dos áudios Coqui com Whisper: cada frase sintetizada é transcrita e comparada
# ao texto; abaixo do limiar, sintetiza de novo (até N tentativas) e fica a melhor.
# A nota é a média da semelhança por letras e por palavras: só letras deixava passar erros
# em frases curtas («je vais à l'école à pied» × «je vais aller coller la pied» = 0,81).
# Usado por gerar_audios_modeles.py (e pela geração verificada dos simulados).
# =====================================================================
import difflib
import re
import unicodedata

from num2words import num2words


def norm(s):
    s = s.lower().replace("’", "'").replace("n°", " numero ").replace("nº", " numero ")
    s = s.replace("compensez", "qu'en pensez")  # homófono que o Whisper sempre erra
    s = re.sub(r"\bet demie\b", "trente", s)
    s = re.sub(r"(\d+)\s*h\s*00\b", r"\1 heures", s)
    s = re.sub(r"(\d+)\s*%", r"\1 pour cent", s)
    s = re.sub(r"(\d+)\s*h\s*(\d+)", r"\1 heures \2", s)
    s = re.sub(r"(\d+)\s*h\b", r"\1 heures", s)
    s = re.sub(r"(\d+)\s*kg\b", r"\1 kilos", s)
    s = re.sub(r"\d+", lambda m: " " + num2words(int(m.group()), lang="fr") + " ", s)
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def nota_textos(e, o):
    letras = difflib.SequenceMatcher(None, e, o).ratio()
    palavras = difflib.SequenceMatcher(None, e.split(), o.split()).ratio()
    return (letras + palavras) / 2


def parecido(esperado, ouvido):
    return nota_textos(norm(esperado), norm(ouvido))


class Whisper:
    """Whisper small (transformers), carregado uma vez."""

    def __init__(self, modelo="openai/whisper-small"):
        from transformers import WhisperProcessor, WhisperForConditionalGeneration
        import torch
        self.torch = torch
        self.proc = WhisperProcessor.from_pretrained(modelo)
        self.modelo = WhisperForConditionalGeneration.from_pretrained(modelo).eval()

    def transcrever(self, y16):
        f = self.proc(y16, sampling_rate=16000, return_tensors="pt").input_features
        with self.torch.no_grad():
            out = self.modelo.generate(f, language="fr", task="transcribe", max_new_tokens=220)
        return self.proc.batch_decode(out, skip_special_tokens=True)[0].strip()
