import { Connection, ConnectionConfig } from '../connection/connection.ts';
import { Statistics } from './statistics.entity.ts';
import { Repository } from '../repository/repository.ts';
import { Tables } from './tables.entity.ts';
import { Columns } from './columns.entity.ts';

export class InformationSchemaService {
  constructor(private informationSchemaConnection: Connection, private options: ConnectionConfig) {
    this.statisticsRepository = this.informationSchemaConnection.getRepository(Statistics);
    this.tableRepository = this.informationSchemaConnection.getRepository(Tables);
    this.columnRepository = this.informationSchemaConnection.getRepository(Columns);
  }

  statisticsRepository: Repository<Statistics>;
  tableRepository: Repository<Tables>;
  columnRepository: Repository<Columns>;

  async getIndexesByTable(tableName: string): Promise<Statistics[]> {
    const qb = this.statisticsRepository
      .createQueryBuilder('s')
      .andWhere('s.table_schema = :schema', { schema: this.options.db })
      .andWhere('s.table_name = :tableName', { tableName })
      .andWhere('s.index_name != :indexName', { indexName: 'PRIMARY' });
    if (+this.informationSchemaConnection.version!.split('.').shift()! > 5) {
      qb.includeNotSelectable();
    }
    return qb.getMany();
  }

  async getIndexes(tableNames: string[]): Promise<Statistics[]> {
    return this.statisticsRepository
      .createQueryBuilder('s')
      .andWhere('s.table_name in :tableNames', { tableNames })
      .andWhere('s.table_schema = :schema', { schema: this.options.db })
      .andWhere('s.index_name != :indexName', { indexName: 'PRIMARY' })
      .getMany();
  }

  async getAllTables(includeColumns = false): Promise<Tables[]> {
    const qb = this.tableRepository
      .createQueryBuilder('t')
      .andWhere('t.table_schema = :schema', { schema: this.options.db });
    if (includeColumns) {
      qb.innerJoinAndSelect('t.columns', 'c');
    }
    return qb.getMany();
  }
}
