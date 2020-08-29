import { ConnectionConfig } from '../src/connection/connection.ts';

export const DB_CONFIG: ConnectionConfig = {
  db: 'orcamento',
  hostname: 'localhost',
  password: 'mysql',
  username: 'root',
  port: 3306,
  sync: false,
  syncOptions: {
    dropUnknownTables: false,
    dropUnknownColumns: false,
    dropUnknownIndices: false,
    dropUnknownRelations: false,
    askBeforeSync: true,
    dropSchema: false,
  },
};
