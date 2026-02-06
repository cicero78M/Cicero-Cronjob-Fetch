
let encrypt;
let decrypt;

describe('crypt utilities', () => {
  const KEY = 'jest-secret-key';

  beforeAll(async () => {
    process.env.SECRET_KEY = KEY;
    const module = await import('../src/utils/crypt.js');
    encrypt = module.encrypt;
    decrypt = module.decrypt;
  });

  test('decrypt(encrypt(text)) returns original text', () => {
    const text = 'Hello from Jest';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });
});
