// Redis Configuration - Production-grade caching for QR codes and session management
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  /**
   * Initialize Redis connection with retry logic
   * Production: Auto-reconnect on failure, non-blocking
   */
  async connect() {
    // Skip Redis if not configured
    if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
      console.log('⚠️  Redis: Not configured (caching disabled)');
      return null;
    }

    try {
      // Create Redis client with production config
      this.client = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          connectTimeout: 5000, // 5 second timeout
          reconnectStrategy: (retries) => {
            if (retries > 3) { // Reduced from 10 to 3
              console.error('❌ Redis: Max reconnection attempts reached');
              this.isConnected = false;
              return false; // Stop reconnecting
            }
            const delay = Math.min(retries * 100, 1000); // Max 1s delay
            console.log(`🔄 Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
            return delay;
          }
        },
        username: process.env.REDIS_USERNAME || undefined,
        password: process.env.REDIS_PASSWORD || undefined,
        database: parseInt(process.env.REDIS_DB) || 0
      });

      // Event handlers (non-blocking)
      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err.message);
        this.isConnected = false;
        // Don't crash the server
      });

      this.client.on('connect', () => {
        console.log('🔄 Redis: Connecting...');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis: Connected and ready');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.client.on('reconnecting', () => {
        this.reconnectAttempts++;
        console.log(`🔄 Redis: Reconnecting (attempt ${this.reconnectAttempts})`);
      });

      this.client.on('end', () => {
        console.log('⚠️  Redis: Connection closed');
        this.isConnected = false;
      });

      // Connect to Redis
      await this.client.connect();
      
      // Test connection
      await this.ping();
      
      return this.client;
    } catch (error) {
      console.error('❌ Redis connection failed:', error.message);
      console.log('⚠️  Server will continue without caching');
      this.isConnected = false;
      return null; // Non-blocking failure
    }
  }

  /**
   * Ping Redis to check connection health
   */
  async ping() {
    try {
      const response = await this.client.ping();
      return response === 'PONG';
    } catch (error) {
      console.error('❌ Redis ping failed:', error);
      return false;
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, skipping cache lookup');
        return null;
      }
      const value = await this.client.get(key);
      return value;
    } catch (error) {
      console.error(`❌ Redis GET error for key ${key}:`, error.message);
      return null; // Fail gracefully
    }
  }

  /**
   * Set value in cache with optional TTL
   * @param {string} key - Cache key
   * @param {string} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: 24 hours)
   */
  async set(key, value, ttl = 86400) {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, skipping cache write');
        return false;
      }
      await this.client.setEx(key, ttl, value);
      return true;
    } catch (error) {
      console.error(`❌ Redis SET error for key ${key}:`, error.message);
      return false; // Fail gracefully
    }
  }

  /**
   * Set value in cache without expiration
   * @param {string} key - Cache key
   * @param {string} value - Value to cache
   */
  async setPersistent(key, value) {
    try {
      if (!this.isConnected) {
        console.warn('⚠️  Redis not connected, skipping cache write');
        return false;
      }
      await this.client.set(key, value);
      return true;
    } catch (error) {
      console.error(`❌ Redis SET error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   */
  async del(key) {
    try {
      if (!this.isConnected) {
        return false;
      }
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`❌ Redis DEL error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   * @param {string} pattern - Key pattern (e.g., "qr:student:*")
   */
  async delPattern(pattern) {
    try {
      if (!this.isConnected) {
        return 0;
      }
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;
      
      await this.client.del(keys);
      return keys.length;
    } catch (error) {
      console.error(`❌ Redis DEL pattern error for ${pattern}:`, error.message);
      return 0;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   */
  async exists(key) {
    try {
      if (!this.isConnected) {
        return false;
      }
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      console.error(`❌ Redis EXISTS error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Get TTL (time to live) for key
   * @param {string} key - Cache key
   * @returns {Promise<number>} TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(key) {
    try {
      if (!this.isConnected) {
        return -2;
      }
      return await this.client.ttl(key);
    } catch (error) {
      console.error(`❌ Redis TTL error for key ${key}:`, error.message);
      return -2;
    }
  }

  /**
   * Increment counter (for rate limiting, statistics)
   * @param {string} key - Counter key
   * @param {number} ttl - Expiration time in seconds
   */
  async increment(key, ttl = 60) {
    try {
      if (!this.isConnected) {
        return 0;
      }
      const value = await this.client.incr(key);
      if (value === 1) {
        // First increment, set expiration
        await this.client.expire(key, ttl);
      }
      return value;
    } catch (error) {
      console.error(`❌ Redis INCR error for key ${key}:`, error.message);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      if (!this.isConnected) {
        return null;
      }
      const info = await this.client.info('stats');
      const memory = await this.client.info('memory');
      
      return {
        connected: this.isConnected,
        info,
        memory
      };
    } catch (error) {
      console.error('❌ Redis stats error:', error.message);
      return null;
    }
  }

  /**
   * Flush all cache (use with caution!)
   */
  async flushAll() {
    try {
      if (!this.isConnected) {
        return false;
      }
      await this.client.flushAll();
      console.log('⚠️  Redis: All cache cleared');
      return true;
    } catch (error) {
      console.error('❌ Redis FLUSHALL error:', error.message);
      return false;
    }
  }

  /**
   * Graceful shutdown
   */
  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        console.log('👋 Redis: Disconnected gracefully');
      }
    } catch (error) {
      console.error('❌ Redis disconnect error:', error.message);
    }
  }
}

// Singleton instance
const redisClient = new RedisClient();

// Auto-connect on import (in production)
if (process.env.NODE_ENV !== 'test') {
  redisClient.connect().catch(err => {
    console.error('❌ Failed to connect to Redis:', err.message);
    console.log('⚠️  Application will continue without caching');
  });
}

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('⚠️  SIGTERM received, closing Redis connection...');
  await redisClient.disconnect();
});

process.on('SIGINT', async () => {
  console.log('⚠️  SIGINT received, closing Redis connection...');
  await redisClient.disconnect();
});

export default redisClient;
