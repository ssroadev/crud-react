const multer = require('multer');
const sharp = require('sharp');
const { createHash } = require('node:crypto');

const PHOTO_BUCKET = 'booking-chat-photos';
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_SIZE, files: 1, fields: 2, fieldSize: 16000, parts: 3 },
  fileFilter(_req, file, callback) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    callback(allowed ? null : Object.assign(new Error('Elige una foto JPG, PNG o WebP.'), { status: 400 }), allowed);
  },
}).single('photo');

function parsePhoto(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE'
      ? 'La foto debe pesar como máximo 5 MB.' : 'Adjunta una sola foto JPG, PNG o WebP y un mensaje de hasta 4000 caracteres.' });
  });
}

async function preparePhoto(file, bookingId, actorId, clientId) {
  let bytes;
  try {
    const image = sharp(file.buffer, { limitInputPixels: 25000000 });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('format');
    // Reprocesar elimina metadatos (incluido GPS) y limita el tamaño de la imagen almacenada.
    bytes = await image.rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw Object.assign(new Error('La foto no es válida. Usa JPG, PNG o WebP de hasta 25 megapíxeles.'), { status: 400 });
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  return { bytes, path: `${bookingId}/${actorId}/${clientId.toLowerCase()}-${digest}.webp` };
}

module.exports = { PHOTO_BUCKET, parsePhoto, preparePhoto };
