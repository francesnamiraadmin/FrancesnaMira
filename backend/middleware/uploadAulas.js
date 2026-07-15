const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { comTratamentoDeErro, UPLOAD_ROOT } = require("./upload");

const TIPOS_VIDEO = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv"
};

const TIPOS_THUMBNAIL = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp"
};

const TIPOS_MATERIAL = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.oasis.opendocument.text": ".odt",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "application/zip": ".zip"
};

function filtro(tipos, mensagem) {
  return (req, file, cb) => {
    if (!tipos[file.mimetype]) return cb(new Error(mensagem));
    cb(null, true);
  };
}

// O id da aula já existe quando esses uploads acontecem (a aula é criada antes
// de anexar vídeo/materiais), então gravamos direto na pasta definitiva —
// diferente do fluxo de produções, que precisa de uma pasta temporária.
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, "aulas", req.params.id, "video");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + (TIPOS_VIDEO[file.mimetype] || ""))
  }),
  fileFilter: filtro(TIPOS_VIDEO, "Formato de vídeo não aceito. Envie MP4, WebM ou OGG."),
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB
});

const uploadThumbnail = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, "aulas", req.params.id, "thumbnail");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + (TIPOS_THUMBNAIL[file.mimetype] || ""))
  }),
  fileFilter: filtro(TIPOS_THUMBNAIL, "Formato de imagem não aceito. Envie PNG, JPEG ou WebP."),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const uploadMaterial = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, "aulas", req.params.id, "materiais");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + (TIPOS_MATERIAL[file.mimetype] || path.extname(file.originalname) || ""))
  }),
  fileFilter: filtro(TIPOS_MATERIAL, "Formato de material não aceito."),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

module.exports = { uploadVideo, uploadThumbnail, uploadMaterial, comTratamentoDeErro, UPLOAD_ROOT };
