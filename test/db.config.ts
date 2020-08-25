import { ConnectionConfig } from '../src/connection/connection.ts';

export const DB_CONFIG: ConnectionConfig = {
  db: 'orcamento',
  hostname: 'localhost',
  password: 'mysql',
  username: 'root',
  port: 3306,
  sync: true,
  syncOptions: {
    dropUnknownTables: true,
    dropUnkownColumns: true,
    askBeforeSync: true,
  },
};
