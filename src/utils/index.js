import jwt from 'jsonwebtoken';
import { customAlphabet } from 'nanoid';

export const genToken = (payload) => {
  const secretKey = process.env.SECRET_KEY;
  const token = jwt.sign(payload, secretKey, { expiresIn: '1h' });
  return token;
};

export const decodeToken = (token) => {
  try {
    const decoded = jwt.verify(token, secretKey);

    console.log('Decoded token:', decoded);
    return decoded;
  } catch (err) {
    console.error('Invalid token:', err.message);
    throw new Error(err);
  }
};

export const generateCode = () => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const generateCode = customAlphabet(alphabet, 10); // 10 là độ dài mã

  const code = generateCode();
  return code;
};
