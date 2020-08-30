import { Connection, ConnectionConfigInternal } from '../connection/connection.ts';
import { Statistics } from './statistics.entity.ts';
import { Repository } from '../repository/repository.ts';
import { Tables } from './tables.entity.ts';
import { Columns } from './columns.entity.ts';
import { TableConstraints } from './table-constraints.entity.ts';
import { KeyColumnUsage } from './key-column-usage.entity.ts';

export class InformationSchemaService {
  constructor(private informationSchemaConnection: Connection, private options: ConnectionConfigInternal) {
    this.statisticsRepository = this.informationSchemaConnection.getRepository(Statistics);
    this.tableRepository = this.informationSchemaConnection.getRepository(Tables);
    this.columnRepository = this.informationSchemaConnection.getRepository(Columns);
  }

  statisticsRepository: Repository<Statistics>;
  tableRepository: Repository<Tables>;
  columnRepository: Repository<Columns>;

  async getAllTables(): Promise<Tables[]> {
    const qb = this.tableRepository
      .createSelectQueryBuilder('t')
      .andWhere('t.table_schema = :schema', { schema: this.options.db })
      .leftJoinAndSelect(['t', Columns], 'c')
      .leftJoinAndSelect(['c', Statistics], 'i', 'i.index_name != :indexName', { indexName: 'PRIMARY' })
      .leftJoinAndSelect(['t', TableConstraints], 'tc', 'tc.constraint_type = :type', { type: 'FOREIGN KEY' })
      .leftJoinAndSelect(['tc', KeyColumnUsage], 'kcu');
    const tables = await qb.getMany();
    return tables.map(table => {
      table.constraints = (table.constraints ?? []).map(constraint => {
        constraint.REFERENCED_TABLE_NAME = constraint.keyColumnUsages[0]?.REFERENCED_TABLE_NAME;
        return constraint;
      });
      table.columns = (table.columns ?? []).map(column => {
        column.indices = column.indices.filter(
          idx => !table.constraints.some(fk => fk.CONSTRAINT_NAME === idx.INDEX_NAME)
        );
        return column;
      });
      return table;
    });
  }
}
