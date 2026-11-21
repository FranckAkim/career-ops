// pg-compatible clients emit their own error events while checked out. A pool
// error listener alone only protects idle clients; queries still reject normally.
export function observeDatabaseErrors(pool, report = () => {}) {
  const handle = () => report('database_connection_interrupted');
  pool.on('error',handle);
  pool.on('connect',client => client.on('error',handle));
  return pool;
}
