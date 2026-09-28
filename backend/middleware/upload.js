const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");

// Params de rota viram nomes de pasta no disco — só aceita ObjectId (24 hex) ou
// índice numérico, e confere que o caminho final continua dentro de UPLOAD_ROOT.
// Impede path traversal ("../../") gravando arquivos fora da pasta de uploads.
function pastaUpload(...partes) {
  for (const parte of partes.slice(1)) {
    if (!/^[a-f0-9]{24}$/i.test(String(parte)) && !/^\d{1,4}$/.test(String(parte)) && !/^[a-z]+$/.test(String(parte))) {
      throw Object.assign(new Error("Parâmetro inválido."), { status: 400 });
    }
  }
  const dir = path.resolve(UPLOAD_ROOT, ...partes.map(String));
  if (!dir.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) {
    throw Object.assign(new Error("Parâmetro inválido."), { status: 400 });
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const TMP_DIR = path.join(UPLOAD_ROOT, "tmp");
fs.mkdirSync(TMP_DIR, { recursive: true });

const TIPOS_ACEITOS = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.oasis.opendocument.text": ".odt",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/webm": ".webm" // formato padrão do MediaRecorder do navegador (gravador ao vivo)
};

function filtroArquivo(req, file, cb) {
  if (!TIPOS_ACEITOS[file.mimetype]) {
    return cb(new Error("Formato não aceito. Envie um arquivo PDF, DOCX, ODT ou áudio (MP3/WAV/WebM)."));
  }
  cb(null, true);
}

// Envio original do aluno: vai para uma pasta temporária; a rota move o
// arquivo para a pasta definitiva (nomeada com o id da produção) depois de
// criar o registro no banco — assim não dependemos de conhecer o id antes.
const uploadOriginal = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + (TIPOS_ACEITOS[file.mimetype] || ""))
  }),
  fileFilter: filtroArquivo,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Arquivo corrigido pelo professor: a produção já existe (:id está na rota).
const uploadCorrigido = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try { cb(null, pastaUpload("producoes", req.params.id)); } catch (err) { cb(err); }
    },
    filename: (req, file, cb) => cb(null, "corrigido-" + Date.now() + (TIPOS_ACEITOS[file.mimetype] || ""))
  }),
  fileFilter: filtroArquivo,
  limits: { fileSize: 10 * 1024 * 1024 }
});

function moverParaPastaDefinitiva(tempPath, producaoId, prefixo, nomeOriginal, mimetype) {
  const dir = pastaUpload("producoes", String(producaoId));
  const ext = TIPOS_ACEITOS[mimetype] || "";
  const destino = path.join(dir, prefixo + "-" + Date.now() + ext);
  fs.renameSync(tempPath, destino);
  return destino;
}

// Middleware wrapper que transforma erros do multer (formato/tamanho) em JSON 400
// em vez de derrubar a request no handler de erro genérico do Express.
function comTratamentoDeErro(middlewareMulter) {
  return (req, res, next) => {
    middlewareMulter(req, res, err => {
      if (err) {
        // Pasta inválida = tentativa de path traversal; o resto é arquivo fora das regras.
        const traversal = err.message === "Parâmetro inválido.";
        require("../utils/monitorSeguranca").registrar(traversal ? "path_traversal" : "upload_rejeitado", req, {
          motivo: err.code || err.message, nomeArquivo: String(req.file?.originalname || "").slice(0, 100)
        });
        return res.status(400).json({ msg: err.message || "Erro ao enviar arquivo." });
      }
      next();
    });
  };
}

module.exports = { uploadOriginal, uploadCorrigido, moverParaPastaDefinitiva, comTratamentoDeErro, UPLOAD_ROOT, pastaUpload };
