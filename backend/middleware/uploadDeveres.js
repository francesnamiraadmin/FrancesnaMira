const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { comTratamentoDeErro, UPLOAD_ROOT } = require("./upload");

// Mesmo whitelist de uploadAulas.js (TIPOS_MATERIAL) — é o único lugar do
// projeto que já aceitava áudio e zip, necessários pra entrega de produção
// oral e de arquivos compactados no dever de casa.
const TIPOS_ENTREGA = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.oasis.opendocument.text": ".odt",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/webm": ".webm", // formato padrão do MediaRecorder do navegador (gravador ao vivo)
  "application/zip": ".zip"
};

// O dever e a atividade já existem quando o aluno envia (foram materializados
// antes), então grava direto na pasta definitiva — sem fase temporária.
const uploadEntregaDever = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, "deveres", req.params.deverId, req.params.index);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + (TIPOS_ENTREGA[file.mimetype] || path.extname(file.originalname) || ""))
  }),
  fileFilter: (req, file, cb) => {
    if (!TIPOS_ENTREGA[file.mimetype]) return cb(new Error("Formato não aceito para entrega de dever de casa."));
    cb(null, true);
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

module.exports = { uploadEntregaDever, comTratamentoDeErro };
