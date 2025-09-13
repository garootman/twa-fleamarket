const sha256 = async (body: string): Promise<string> => {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(body));
  return hex(new Uint8Array(hashBuffer));
};

const hmacSha256 = async (body: string, secret: string | Uint8Array): Promise<Uint8Array> => {
  // similar to https://stackoverflow.com/a/74428751/319229
  const enc = new TextEncoder();
  const algorithm = { name: 'HMAC', hash: 'SHA-256' };
  if (!(secret instanceof Uint8Array)) {
    secret = enc.encode(secret);
  }
  const key = await crypto.subtle.importKey('raw', secret, algorithm, false, ['sign', 'verify']);

  const signature = await crypto.subtle.sign(algorithm.name, key, enc.encode(body));

  return new Uint8Array(signature);
};

const hex = (buffer: Uint8Array): string => {
  const hashArray = Array.from(buffer);

  // convert bytes to hex string
  const digest = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return digest;
};

const generateSecret = (bytes: number): string => {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
};

export { sha256, hmacSha256, hex, generateSecret };
