let mysql;
let pool;

async function init() {
  if (!mysql) {
    mysql = await import('mysql2/promise');
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASS,
      database: process.env.MYSQL_DB,
      port: process.env.MYSQL_PORT || 3306,
    });
  }
}

export async function query(text, params) {
  await init();
  const [rows] = await pool.execute(text, params);
  return { rows };
}

export async function getClient() {
  await init();
  const connection = await pool.getConnection();

  return {
    query: async (text, params) => {
      const [rows] = await connection.execute(text, params);
      return { rows };
    },
    release: () => connection.release(),
  };
}

export async function close() {
  if (pool) await pool.end();
}
