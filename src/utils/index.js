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

export const getRandomNumberByLength = (length = 6) => {
  if (length <= 0) return 0;

  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;

  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const numberWithCommas = (value = '', comma = ',') => {
  if (!Number(value)) return value;
  return value
    ? String(
        Number.isInteger(+value) ? +value : Number(value).toFixed(2),
      ).replace(/\B(?=(\d{3})+(?!\d))/g, comma)
    : value;
};
