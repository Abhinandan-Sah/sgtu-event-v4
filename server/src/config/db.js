import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

// Use Neon serverless for production scalability
const pool = neon(process.env.NEON_DATABASE_URL);

const query = async (text, params) => {
  try {
    const res = await pool(text, params);
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

export { query, pool };
export default { query, pool };
