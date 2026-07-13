const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");
const TMP_DIR = path.join(UPLOAD_ROOT, "tmp");
fs.mkdirSync(TMP_DIR, { recursive: true });

const TIPOS_ACEITOS = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.oasis.opendocument.text": ".odt"
};

function filtroArquivo(req, file, cb) {
  if (!TIPOS_ACEITOS[file.mimetype]) {
    return cb(new Error("Formato não aceito. Envie um arquivo PDF, DOCX ou ODT."));
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
      const dir = path.join(UPLOAD_ROOT, "producoes", req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, "corrigido-" + Date.now() + (TIPOS_ACEITOS[file.mimetype] || ""))
  }),
  fileFilter: filtroArquivo,
  limits: { fileSize: 10 * 1024 * 1024 }
});

function moverParaPastaDefinitiva(tempPath, producaoId, prefixo, nomeOriginal, mimetype) {
  const dir = path.join(UPLOAD_ROOT, "producoes", String(producaoId));
  fs.mkdirSync(dir, { recursive: true });
  const ext = TIPOS_ACEITOS[mimetype] || path.extname(nomeOriginal) || "";
  const destino = path.join(dir, prefixo + "-" + Date.now() + ext);
  fs.renameSync(tempPath, destino);
  return destino;
}

// Middleware wrapper que transforma erros do multer (formato/tamanho) em JSON 400
// em vez de derrubar a request no handler de erro genérico do Express.
function comTratamentoDeErro(middlewareMulter) {
  return (req, res, next) => {
    middlewareMulter(req, res, err => {
      if (err) return res.status(400).json({ msg: err.message || "Erro ao enviar arquivo." });
      next();
    });
  };
}

module.exports = { uploadOriginal, uploadCorrigido, moverParaPastaDefinitiva, comTratamentoDeErro, UPLOAD_ROOT };
