/**
 * 共享密码哈希工具：复用 Durable Object 密码哈希器（argon2）
 * 供 Better Auth 注册/登录和管理员密码重置共用。
 */
export function getPasswordHasher(env: Env) {
  const PASSWORD_HASHER_POOL_SIZE = 10;
  const index = Math.floor(Math.random() * PASSWORD_HASHER_POOL_SIZE);
  const id = env.PASSWORD_HASHER.idFromName(`hasher-${index}`);
  return env.PASSWORD_HASHER.get(id);
}
