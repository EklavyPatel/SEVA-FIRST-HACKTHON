const allowed = ['image/jpeg', 'image/png', 'image/webp'];

export async function prepareImage(file, { illustration = false } = {}) {
  if (!file || (!allowed.includes(file.type) && !(illustration && file.type === 'image/svg+xml'))) {
    throw new Error('JPG, PNG અથવા WebP ફોટો પસંદ કરો.');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('ફોટો 10 MB કરતાં નાનો હોવો જોઈએ.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (image.naturalWidth < 64 || image.naturalHeight < 64) throw new Error('ફોટો ખૂબ નાનો છે. વધુ સ્પષ્ટ ફોટો લો.');
    if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('ફોટાનું રિઝોલ્યુશન ખૂબ મોટું છે. નાનો ફોટો લો.');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('આ બ્રાઉઝરમાં ફોટો તૈયાર થઈ શક્યો નથી.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.86);
    const base64 = data.split(',')[1];
    if (base64.length > 4 * 1024 * 1024) throw new Error('ફોટો ખૂબ મોટો છે. નાનો ફોટો લો.');
    return { preview: data, base64, mimeType: 'image/jpeg', width: canvas.width, height: canvas.height,
      name: illustration ? 'નમૂનાનું ચિત્ર (વાસ્તવિક ફોટો નથી)' : file.name, illustration };
  } catch (error) {
    if (error.name === 'EncodingError') throw new Error('ફોટો ખૂલી શક્યો નથી. અન્ય ફોટો પસંદ કરો.');
    throw error;
  } finally { URL.revokeObjectURL(url); }
}
