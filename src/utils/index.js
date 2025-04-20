import jwt from 'jsonwebtoken';

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
