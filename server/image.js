import { ApiError } from './errors.js';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_BODY_BYTES = 4.1 * 1024 * 1024;

// The browser decodes, resizes and re-encodes JPEG/PNG/WebP to a metadata-free JPEG.
// Server checks bytes and SOF dimensions independently; Gemini performs full decoding.
export function validateImage(input) {
  if (!input || input.mimeType !== 'image/jpeg' || typeof input.base64 !== 'string') {
    throw new ApiError(400, 'INVALID_IMAGE', 'માન્ય ફોટો પસંદ કરીને ફરી પ્રયાસ કરો.');
  }
  if (input.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw new ApiError(413, 'IMAGE_TOO_LARGE', 'ફોટો ખૂબ મોટો છે. નાનો ફોટો પસંદ કરો.');
  }
  if (input.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) {
    throw new ApiError(400, 'INVALID_IMAGE', 'ફોટાનું સ્વરૂપ વાંચી શકાયું નથી.');
  }
  const bytes = Buffer.from(input.base64, 'base64');
  if (bytes.toString('base64') !== input.base64) throw new ApiError(400, 'INVALID_IMAGE', 'ફોટાનું સ્વરૂપ વાંચી શકાયું નથી.');
  if (bytes.length < 20 || bytes.length > MAX_IMAGE_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new ApiError(400, 'INVALID_IMAGE', 'આ ફોટો વાંચી શકાયો નથી. ફરીથી ફોટો લો.');
  }
  let offset = 2;
  let size;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
      size = { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      break;
    }
    offset += length;
  }
  if (!size || size.width < 64 || size.height < 64 || size.width > 4096 || size.height > 4096 ||
      size.width * size.height > 12_000_000) {
    throw new ApiError(400, 'INVALID_IMAGE', 'સ્પષ્ટ ફોટો પસંદ કરો (ઓછામાં ઓછું 64 × 64 પિક્સેલ).');
  }
  return { base64: bytes.toString('base64'), mimeType: 'image/jpeg', ...size };
}
