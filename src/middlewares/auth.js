import jwt from 'jsonwebtoken';

const authenticateToken = (required = true) => {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      if (required) {
        return res.status(401).json({ message: 'No token provided' });
      } else {
        return next(); // Cho phép đi tiếp nếu không bắt buộc
      }
    }

    try {
      const secret = process.env.SECRET_KEY || 'superSecret';
      const decoded = jwt.verify(token, secret);

      // 👇 Tự gán req.user theo ý bạn
      req.user = {
        id: decoded.userId,
      };
      req.extendParams = decoded.extendParams;

      next();
    } catch (err) {
      console.error(err);
      return res.status(403).json({ message: 'Invalid token' });
    }
  };
};

export const auth = {
  required: authenticateToken(true),
  optional: authenticateToken(false),
};
